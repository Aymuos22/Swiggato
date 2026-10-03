import "server-only";

import { isGroqRateLimitError, runMcpPricingAgent } from "@/lib/ai/mcp-pricing-agent";
import type {
  AdapterSessionContext,
  AuthResult,
  FoodItem,
  FoodPlatformAdapter,
  Location,
  Menu,
  NormalizedPrice,
  OtpRequestResult,
  PricingRequest,
  Restaurant
} from "./types";
import { McpAuthError, McpHttpClient, McpToolError } from "./mcp-client";

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function numberFrom(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function zomatoEndpoint() {
  return process.env.ZOMATO_MCP_URL ?? "https://mcp-server.zomato.com/mcp";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return undefined;
}

function collectArrays(payload: unknown, keys: string[]) {
  const root = asRecord(payload);
  if (!root) {
    return asArray<Record<string, unknown>>(payload);
  }

  const layers = [root, asRecord(root.data), asRecord(root.result), asRecord(asRecord(root.result)?.data)].filter(
    Boolean
  ) as Record<string, unknown>[];

  for (const layer of layers) {
    for (const key of keys) {
      if (key in layer) {
        return asArray<Record<string, unknown>>(layer[key]);
      }
    }
  }

  return asArray<Record<string, unknown>>(payload);
}

function itemNameOf(entry: Record<string, unknown>) {
  return firstString(entry.name, entry.item_name, entry.title, entry.itemName) || "";
}

function variantIdOf(entry: Record<string, unknown>) {
  return firstString(entry.variant_id, entry.variantId);
}

function pickMenuItem(items: Record<string, unknown>[], dishQuery: string, dietary?: string | null) {
  if (items.length === 0) {
    return null;
  }

  const scored = items
    .map((entry) => {
      const name = itemNameOf(entry);
      let score = scoreText(name, dishQuery);
      if (dietary === "veg" && entry.is_veg === true) {
        score += 2;
      }
      if (dietary === "non_veg" && entry.is_veg === false) {
        score += 2;
      }
      const price = numberFrom(entry.price ?? entry.min_price ?? entry.item_price ?? entry.display_price, Number.POSITIVE_INFINITY);
      return { entry, score, price };
    })
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.price - right.price;
    });

  return scored.find((row) => variantIdOf(row.entry))?.entry ?? scored[0]?.entry ?? null;
}

function scoreText(haystack: string, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 2);

  return tokens.reduce((score, token) => (haystack.toLowerCase().includes(token) ? score + 1 : score), 0);
}

function pickAddress(addresses: Record<string, unknown>[], location: Location) {
  if (addresses.length === 0) {
    return null;
  }

  const needle = `${location.label ?? ""} ${location.address ?? ""}`;
  return [...addresses].sort((left, right) => {
    const leftText = `${firstString(left.address, left.address_line, left.addressLine, left.name) ?? ""}`;
    const rightText = `${firstString(right.address, right.address_line, right.addressLine, right.name) ?? ""}`;
    return scoreText(rightText, needle) - scoreText(leftText, needle);
  })[0];
}

function extractPricing(cart: Record<string, unknown>, menuPrice: number) {
  const nestedData = asRecord(cart.data) ?? asRecord(asRecord(cart.result)?.data) ?? asRecord(cart.result);
  const pricing =
    asRecord(cart.pricing) ??
    asRecord(cart.bill) ??
    asRecord(cart.payment_details) ??
    asRecord(nestedData?.pricing) ??
    asRecord(nestedData?.bill) ??
    asRecord(nestedData?.payment_details) ??
    nestedData ??
    cart;

  const itemPrice = numberFrom(
    pricing.item_total ?? pricing.subtotal ?? pricing.items_total ?? menuPrice,
    menuPrice
  );
  const packagingFee = numberFrom(
    pricing.packaging_fee ?? pricing.restaurant_packaging_charge ?? pricing.restaurant_packaging_fee,
    0
  );
  const deliveryFee = numberFrom(pricing.delivery_charge ?? pricing.delivery_fee ?? pricing.deliveryCharges, 0);
  const platformFee = numberFrom(pricing.platform_fee ?? pricing.surge_fee ?? pricing.platformFee, 0);
  const taxes = numberFrom(pricing.taxes ?? pricing.tax_amount ?? pricing.taxes_and_charges ?? pricing.gst, 0);
  const discount = numberFrom(
    pricing.discount ?? pricing.promo_discount ?? pricing.coupon_discount ?? pricing.total_discount,
    0
  );
  const finalPrice = numberFrom(
    pricing.to_pay ?? pricing.grand_total ?? pricing.total ?? pricing.order_total ?? pricing.total_amount,
    itemPrice + packagingFee + deliveryFee + platformFee + taxes - discount
  );

  return { itemPrice, packagingFee, deliveryFee, platformFee, taxes, discount, finalPrice };
}

export class ZomatoAdapter implements FoodPlatformAdapter {
  platform = "ZOMATO" as const;

  private client(session: AdapterSessionContext) {
    if (!session.accessToken) {
      throw new McpToolError("Zomato MCP access token is missing. Start OAuth from Accounts.");
    }
    return new McpHttpClient(zomatoEndpoint(), session.accessToken);
  }

  async requestOtp(): Promise<OtpRequestResult> {
    return {
      supported: false,
      message: "Use Zomato OAuth. Direct OTP endpoints are not called by this app."
    };
  }

  async verifyOtp(): Promise<AuthResult> {
    return {
      status: "ERROR",
      message: "Use the Zomato OAuth connection flow instead."
    };
  }

  async searchRestaurants(query: string, location: Location, session: AdapterSessionContext): Promise<Restaurant[]> {
    const prices = await this.getPricing({ query, location, session });
    return prices.map((price) => ({
      id: String(price.rawMetadata?.restaurantId ?? ""),
      platform: "ZOMATO" as const,
      name: price.restaurantName
    }));
  }

  async searchItems(query: string, location: Location, session: AdapterSessionContext): Promise<FoodItem[]> {
    const prices = await this.getPricing({ query, location, session });
    return prices.map((price, index) => ({
      id: String(price.rawMetadata?.itemId ?? index),
      platform: "ZOMATO",
      restaurantId: String(price.rawMetadata?.restaurantId ?? ""),
      restaurantName: price.restaurantName,
      name: price.itemName,
      menuPrice: price.itemPrice
    }));
  }

  async getRestaurant(restaurantId: string): Promise<Restaurant> {
    return { id: restaurantId, platform: "ZOMATO", name: "Zomato restaurant" };
  }

  async getMenu(restaurantId: string): Promise<Menu> {
    return { restaurantId, items: [] };
  }

  async getPricing(request: PricingRequest): Promise<NormalizedPrice[]> {
    try {
      return await this.getLivePricing(request);
    } catch (error) {
      if (error instanceof McpAuthError) {
        await request.session.markExpired?.(error.message);
        throw new Error("Zomato session expired. Reconnect Zomato from Accounts.");
      }
      if (error instanceof McpToolError) {
        throw new Error(`Zomato pricing failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getLivePricing(request: PricingRequest): Promise<NormalizedPrice[]> {
    const client = this.client(request.session);

    // Prefer schema-safe MCP path first to stay under Groq TPM limits.
    try {
      return await this.getDeterministicPricing(client, request);
    } catch (deterministicError) {
      if (deterministicError instanceof McpAuthError) {
        throw deterministicError;
      }

      try {
        const agentPrice = await runMcpPricingAgent({
          platform: "ZOMATO",
          client,
          query: request.query,
          location: request.location,
          intent: request.intent
        });
        return [agentPrice];
      } catch (agentError) {
        if (isGroqRateLimitError(agentError)) {
          throw deterministicError;
        }
        throw agentError;
      }
    }
  }

  private async getDeterministicPricing(
    client: McpHttpClient,
    request: PricingRequest
  ): Promise<NormalizedPrice[]> {
    await client.initialize().catch(() => undefined);
    await client.listTools().catch(() => undefined);

    const addressPayload = await client.callTool("get_saved_addresses_for_user", {});
    const addressList = collectArrays(addressPayload, [
      "addresses",
      "address_list",
      "saved_addresses",
      "user_addresses",
      "results"
    ]);
    const address = pickAddress(addressList, request.location);
    const addressId = firstString(address?.id, address?.address_id, address?.addressId);

    if (!addressId) {
      throw new McpToolError(
        "Zomato has no saved delivery address. Save this location in the Zomato app, then compare again."
      );
    }

    const dishQuery = request.intent?.dishQuery || request.query;
    const searchPayload = await client.callTool("get_restaurants_for_keyword", {
      address_id: addressId,
      keyword: dishQuery,
      page_size: 10
    });

    const restaurants = collectArrays(searchPayload, ["restaurants", "results", "restaurant_list", "data"]);
    const preferred = request.intent?.restaurantHint?.toLowerCase();
    const restaurant =
      (preferred
        ? restaurants.find((entry) =>
            String(entry.name ?? entry.restaurant_name ?? "")
              .toLowerCase()
              .includes(preferred)
          )
        : undefined) ?? restaurants[0];

    const restaurantIdRaw = firstString(
      restaurant?.res_id,
      restaurant?.restaurant_id,
      restaurant?.id,
      restaurant?.entity_id
    );
    const restaurantId =
      restaurantIdRaw && Number.isFinite(Number(restaurantIdRaw)) ? Number(restaurantIdRaw) : restaurantIdRaw;
    const restaurantName =
      firstString(restaurant?.name, restaurant?.restaurant_name, restaurant?.title) || "Zomato restaurant";

    if (restaurantId == null || restaurantId === "") {
      throw new McpToolError(`No Zomato restaurants matched "${dishQuery}".`);
    }

    let menuItems = asArray<Record<string, unknown>>(restaurant?.items);
    if (menuItems.length === 0) {
      const listingPayload = await client
        .callTool("get_menu_items_listing", { res_id: restaurantId, address_id: addressId })
        .catch(() => null);
      menuItems = listingPayload
        ? collectArrays(listingPayload, [
            "items",
            "item_mappings",
            "menu",
            "dishes",
            "menu_items",
            "results",
            "data"
          ])
        : [];
    }

    const matched = pickMenuItem(menuItems, dishQuery, request.intent?.dietary);
    if (!matched) {
      throw new McpToolError(`No Zomato menu items matched "${dishQuery}".`);
    }

    const variantId = variantIdOf(matched);
    const itemName = itemNameOf(matched) || dishQuery;
    const menuPrice = numberFrom(
      matched.price ?? matched.item_price ?? matched.display_price ?? matched.min_price,
      0
    );

    if (!variantId) {
      throw new McpToolError(
        `Zomato found "${itemName}" but did not return a variant_id. Cannot compute final payable price.`
      );
    }

    const cartPayload = await client.callTool("create_cart", {
      res_id: restaurantId,
      address_id: addressId,
      items: [{ variant_id: variantId, quantity: 1 }],
      payment_type: "cash_on_delivery"
    });

    const pricing = extractPricing(asRecord(cartPayload) ?? {}, menuPrice);

    if (request.intent?.maxFinalPrice && pricing.finalPrice > request.intent.maxFinalPrice) {
      throw new McpToolError(
        `Zomato match ₹${pricing.finalPrice} exceeds your max ₹${request.intent.maxFinalPrice}.`
      );
    }

    return [
      {
        platform: "ZOMATO",
        restaurantName,
        itemName,
        ...pricing,
        currency: "INR",
        rawMetadata: {
          adapter: "zomato-mcp-deterministic",
          restaurantId,
          variantId,
          itemId: firstString(matched.catalogue_id, matched.item_id, matched.id, matched.dish_id) ?? null,
          addressId,
          dishQuery,
          intent: request.intent ?? null
        }
      }
    ];
  }
}
