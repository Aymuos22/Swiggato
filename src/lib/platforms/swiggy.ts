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

type SwiggyAddress = {
  id: string;
  addressLine: string;
  phoneNumber?: string;
  addressCategory?: string;
  addressTag?: string;
};

type SwiggyMenuItem = {
  name: string;
  price?: number;
  menu_item_id?: string;
  restaurant_id?: string;
  restaurant_name?: string;
  inStock?: number;
  variations?: Array<{
    name?: string;
    price?: number;
    id?: string;
    groupId?: string;
    default?: number;
    inStock?: number;
  }>;
  variantsV2?: Array<{
    groupId: string;
    name: string;
    variations: Array<{ id: string; name: string; price?: number; default?: number; inStock?: number }>;
  }>;
};

type SwiggyCartPricing = {
  item_total?: number;
  delivery_charge?: number;
  taxes_and_charges?: number;
  to_pay?: number;
};

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function scoreAddress(address: SwiggyAddress, location: Location) {
  const haystack = `${address.addressTag ?? ""} ${address.addressCategory ?? ""} ${address.addressLine}`.toLowerCase();
  const needle = `${location.label ?? ""} ${location.address ?? ""}`.toLowerCase();
  return needle
    .split(/\W+/)
    .filter((token) => token.length > 2)
    .reduce((score, token) => (haystack.includes(token) ? score + 1 : score), 0);
}

function pickAddress(addresses: SwiggyAddress[], location: Location) {
  if (addresses.length === 0) {
    return null;
  }

  return [...addresses].sort((left, right) => scoreAddress(right, location) - scoreAddress(left, location))[0];
}

function buildCartItem(item: SwiggyMenuItem) {
  const cartItem: Record<string, unknown> = {
    menu_item_id: item.menu_item_id,
    quantity: 1
  };

  if (item.variations?.length) {
    const selected =
      item.variations.find((variation) => variation.default === 1 && variation.inStock !== 0) ??
      item.variations.find((variation) => variation.inStock !== 0) ??
      item.variations[0];

    cartItem.variants = [
      {
        id: selected.id,
        groupId: selected.groupId,
        name: selected.name
      }
    ];
  } else if (item.variantsV2?.length) {
    cartItem.variantsV2 = item.variantsV2.map((group) => {
      const variation =
        group.variations.find((entry) => entry.default === 1 && entry.inStock !== 0) ??
        group.variations.find((entry) => entry.inStock !== 0) ??
        group.variations[0];

      return {
        groupId: group.groupId,
        name: group.name,
        variations: [{ id: variation.id, name: variation.name, price: variation.price }]
      };
    });
  }

  return cartItem;
}

function extractCartBundle(payload: unknown) {
  const root = asRecord(payload);
  const nested = asRecord(root?.data) ?? root;
  const pricing = asRecord(nested?.pricing) as SwiggyCartPricing | null;
  const offers = asRecord(nested?.offers);
  const restaurant = asRecord(nested?.restaurant);
  const items = asArray<Record<string, unknown>>(nested?.items);

  return { pricing, offers, restaurant, items };
}

export class SwiggyAdapter implements FoodPlatformAdapter {
  platform = "SWIGGY" as const;

  private foodEndpoint() {
    const base = process.env.SWIGGY_OAUTH_BASE_URL ?? "https://mcp.swiggy.com";
    return `${base.replace(/\/$/, "")}/food`;
  }

  private client(session: AdapterSessionContext) {
    if (!session.accessToken) {
      throw new McpToolError("Swiggy OAuth access token is missing. Reconnect Swiggy.");
    }
    return new McpHttpClient(this.foodEndpoint(), session.accessToken);
  }

  async requestOtp(): Promise<OtpRequestResult> {
    return {
      supported: false,
      message: "Use Swiggy OAuth. Direct OTP endpoints are not called by this app."
    };
  }

  async verifyOtp(): Promise<AuthResult> {
    return {
      status: "ERROR",
      message: "Use the Swiggy OAuth connection flow instead."
    };
  }

  async searchRestaurants(query: string, location: Location, session: AdapterSessionContext): Promise<Restaurant[]> {
    const client = this.client(session);
    await client.initialize().catch(() => undefined);
    const addresses = asArray<SwiggyAddress>(
      (await client.callTool<{ addresses?: SwiggyAddress[] }>("get_addresses", { page: 1, pageSize: 10 }))?.addresses
    );
    const address = pickAddress(addresses, location);
    if (!address) {
      throw new McpToolError("No Swiggy addresses found on the connected account.");
    }

    const payload = await client.callTool<{ restaurants?: Array<Record<string, unknown>> }>("search_restaurants", {
      addressId: address.id,
      query
    });

    return asArray<Record<string, unknown>>(payload?.restaurants).map((restaurant) => ({
      id: String(restaurant.restaurantId ?? restaurant.id ?? ""),
      platform: "SWIGGY" as const,
      name: String(restaurant.name ?? "Swiggy restaurant"),
      area: typeof restaurant.areaName === "string" ? restaurant.areaName : undefined
    }));
  }

  async searchItems(query: string, location: Location, session: AdapterSessionContext): Promise<FoodItem[]> {
    const prices = await this.getPricing({ query, location, session });
    return prices.map((price, index) => ({
      id: String(price.rawMetadata?.menuItemId ?? index),
      platform: "SWIGGY",
      restaurantId: String(price.rawMetadata?.restaurantId ?? ""),
      restaurantName: price.restaurantName,
      name: price.itemName,
      menuPrice: price.itemPrice
    }));
  }

  async getRestaurant(restaurantId: string): Promise<Restaurant> {
    return { id: restaurantId, platform: "SWIGGY", name: "Swiggy restaurant" };
  }

  async getMenu(restaurantId: string, session: AdapterSessionContext): Promise<Menu> {
    const client = this.client(session);
    await client.initialize().catch(() => undefined);
    const addresses = asArray<SwiggyAddress>(
      (await client.callTool<{ addresses?: SwiggyAddress[] }>("get_addresses", { page: 1, pageSize: 10 }))?.addresses
    );
    const address = addresses[0];
    if (!address) {
      throw new McpToolError("No Swiggy addresses found on the connected account.");
    }

    const payload = await client.callTool<{ items?: SwiggyMenuItem[] }>("get_restaurant_menu", {
      addressId: address.id,
      restaurantId
    });

    return {
      restaurantId,
      items: asArray<SwiggyMenuItem>(payload?.items).map((item) => ({
        id: String(item.menu_item_id ?? item.name),
        platform: "SWIGGY",
        restaurantId,
        restaurantName: String(item.restaurant_name ?? "Swiggy restaurant"),
        name: item.name,
        menuPrice: Number(item.price ?? 0)
      }))
    };
  }

  async getPricing(request: PricingRequest): Promise<NormalizedPrice[]> {
    try {
      return await this.getLivePricing(request);
    } catch (error) {
      if (error instanceof McpAuthError) {
        await request.session.markExpired?.(error.message);
        throw new Error("Swiggy session expired. Reconnect Swiggy from Accounts.");
      }
      if (error instanceof McpToolError) {
        throw new Error(`Swiggy pricing failed: ${error.message}`);
      }
      throw error;
    }
  }

  private async getLivePricing(request: PricingRequest): Promise<NormalizedPrice[]> {
    const client = this.client(request.session);

    try {
      return await this.getDeterministicPricing(client, request);
    } catch (deterministicError) {
      if (deterministicError instanceof McpAuthError) {
        throw deterministicError;
      }

      try {
        const agentPrice = await runMcpPricingAgent({
          platform: "SWIGGY",
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
    await client.callTool("flush_food_cart", {}).catch(() => undefined);

    const addressPayload = await client.callTool<{ addresses?: SwiggyAddress[] }>("get_addresses", {
      page: 1,
      pageSize: 10
    });
    const addresses = asArray<SwiggyAddress>(addressPayload?.addresses);
    const address = pickAddress(addresses, request.location);

    if (!address) {
      throw new McpToolError(
        "No Swiggy delivery addresses found on the connected account. Add an address in the Swiggy app first."
      );
    }

    const dishQuery = request.intent?.dishQuery || request.query;
    const menuArgs: Record<string, unknown> = {
      addressId: address.id,
      query: dishQuery
    };

    if (request.intent?.dietary === "veg") {
      menuArgs.vegFilter = 1;
    }

    if (request.intent?.restaurantHint) {
      const restaurants = await client.callTool<{ restaurants?: Array<Record<string, unknown>> }>(
        "search_restaurants",
        {
          addressId: address.id,
          query: request.intent.restaurantHint
        }
      );
      const restaurant = asArray<Record<string, unknown>>(restaurants?.restaurants)[0];
      const restaurantId = restaurant?.restaurantId ?? restaurant?.id;
      if (restaurantId) {
        menuArgs.restaurantIdOfAddedItem = String(restaurantId);
      }
    }

    const menuPayload = await client.callTool<{ items?: SwiggyMenuItem[] }>("search_menu", menuArgs);
    const items = asArray<SwiggyMenuItem>(menuPayload?.items).filter(
      (item) => item.menu_item_id && item.restaurant_id && item.inStock !== 0
    );

    if (items.length === 0) {
      throw new McpToolError(`No in-stock Swiggy menu matches for "${dishQuery}".`);
    }

    const item = items[0];
    await client.callTool("update_food_cart", {
      restaurantId: item.restaurant_id,
      restaurantName: item.restaurant_name,
      addressId: address.id,
      cartItems: [buildCartItem(item)]
    });

    const cartPayload = await client.callTool("get_food_cart", {
      addressId: address.id,
      restaurantName: item.restaurant_name
    });

    await client.callTool("flush_food_cart", {}).catch(() => undefined);

    const { pricing, offers, restaurant, items: cartItems } = extractCartBundle(cartPayload);
    const cartItemRow = cartItems[0];
    const itemPrice = Number(pricing?.item_total ?? item.price ?? cartItemRow?.final_price ?? 0);
    const deliveryFee = Number(pricing?.delivery_charge ?? 0);
    const taxes = Number(pricing?.taxes_and_charges ?? 0);
    const discount =
      typeof offers?.coupon_discount === "number" && offers.coupon_discount > 0
        ? Number(offers.coupon_discount)
        : 0;
    const finalPrice = Number(pricing?.to_pay ?? itemPrice + deliveryFee + taxes - discount);

    if (request.intent?.maxFinalPrice && finalPrice > request.intent.maxFinalPrice) {
      throw new McpToolError(
        `Swiggy match ₹${finalPrice} exceeds your max ₹${request.intent.maxFinalPrice}.`
      );
    }

    return [
      {
        platform: "SWIGGY",
        restaurantName:
          (typeof restaurant?.name === "string" && restaurant.name) ||
          item.restaurant_name ||
          "Swiggy restaurant",
        itemName: (typeof cartItemRow?.name === "string" && cartItemRow.name) || item.name,
        itemPrice,
        packagingFee: 0,
        deliveryFee,
        platformFee: 0,
        taxes,
        discount,
        finalPrice,
        currency: "INR",
        rawMetadata: {
          adapter: "swiggy-mcp-fallback",
          addressId: address.id,
          addressLine: address.addressLine,
          restaurantId: item.restaurant_id,
          menuItemId: item.menu_item_id,
          dishQuery,
          intent: request.intent ?? null,
          coupon: offers?.coupon_applied ?? null
        }
      }
    ];
  }
}
