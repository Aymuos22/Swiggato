import "server-only";

import { z } from "zod";

import type { SearchIntent } from "@/lib/ai/groq-search";
import type { Platform } from "@/lib/db/schema";
import type { McpHttpClient, McpToolDefinition } from "@/lib/platforms/mcp-client";
import { McpToolError } from "@/lib/platforms/mcp-client";
import type { Location, NormalizedPrice } from "@/lib/platforms/types";

const priceResultSchema = z.object({
  restaurantName: z.string().min(1),
  itemName: z.string().min(1),
  itemPrice: z.number(),
  packagingFee: z.number().default(0),
  deliveryFee: z.number().default(0),
  platformFee: z.number().default(0),
  taxes: z.number().default(0),
  discount: z.number().default(0),
  finalPrice: z.number(),
  restaurantId: z.union([z.string(), z.number()]).optional(),
  itemId: z.union([z.string(), z.number()]).optional(),
  addressId: z.union([z.string(), z.number()]).optional()
});

type ChatMessage =
  | { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; name?: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    };

type GroqTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

const SUBMIT_TOOL = "submit_price_result";

const ZOMATO_ALLOWED = new Set([
  "get_saved_addresses_for_user",
  "get_restaurants_for_keyword",
  "get_menu_items_listing",
  "get_restaurant_menu_by_categories",
  "create_cart"
]);

const SWIGGY_ALLOWED = new Set([
  "get_addresses",
  "search_restaurants",
  "search_menu",
  "update_food_cart",
  "get_food_cart",
  "flush_food_cart"
]);

/** Compact parameter schema — full MCP schemas blow Groq TPM limits. */
const SLIM_PARAMS: Record<string, Record<string, unknown>> = {
  get_saved_addresses_for_user: { type: "object", properties: {}, additionalProperties: false },
  get_restaurants_for_keyword: {
    type: "object",
    additionalProperties: false,
    properties: {
      address_id: { type: "string" },
      keyword: { type: "string" },
      page_size: { type: "integer" }
    },
    required: ["address_id", "keyword"]
  },
  get_menu_items_listing: {
    type: "object",
    additionalProperties: false,
    properties: {
      res_id: { type: "integer" },
      address_id: { type: "string" }
    },
    required: ["res_id", "address_id"]
  },
  get_restaurant_menu_by_categories: {
    type: "object",
    additionalProperties: false,
    properties: {
      res_id: { type: "integer" },
      address_id: { type: "string" },
      categories: { type: "array", items: { type: "string" } }
    },
    required: ["res_id", "address_id", "categories"]
  },
  create_cart: {
    type: "object",
    additionalProperties: false,
    properties: {
      res_id: { type: "integer" },
      address_id: { type: "string" },
      payment_type: { type: "string", enum: ["cash_on_delivery", "upi"] },
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            variant_id: { type: "string" },
            quantity: { type: "integer" }
          },
          required: ["variant_id", "quantity"]
        }
      }
    },
    required: ["res_id", "items", "address_id", "payment_type"]
  },
  get_addresses: {
    type: "object",
    additionalProperties: false,
    properties: { page: { type: "integer" }, pageSize: { type: "integer" } }
  },
  search_restaurants: {
    type: "object",
    additionalProperties: false,
    properties: { addressId: { type: "string" }, query: { type: "string" } },
    required: ["addressId", "query"]
  },
  search_menu: {
    type: "object",
    additionalProperties: false,
    properties: {
      addressId: { type: "string" },
      query: { type: "string" },
      vegFilter: { type: "integer" },
      restaurantIdOfAddedItem: { type: "string" }
    },
    required: ["addressId", "query"]
  },
  update_food_cart: {
    type: "object",
    additionalProperties: false,
    properties: {
      restaurantId: { type: "string" },
      restaurantName: { type: "string" },
      addressId: { type: "string" },
      cartItems: { type: "array" }
    },
    required: ["restaurantId", "addressId", "cartItems"]
  },
  get_food_cart: {
    type: "object",
    additionalProperties: false,
    properties: { addressId: { type: "string" }, restaurantName: { type: "string" } },
    required: ["addressId"]
  },
  flush_food_cart: { type: "object", properties: {}, additionalProperties: false }
};

export function isGroqRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("429") || /rate limit/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryMs(body: string) {
  const match = body.match(/try again in ([0-9.]+)s/i);
  if (!match) {
    return 12_000;
  }
  return Math.min(30_000, Math.ceil(Number(match[1]) * 1000) + 500);
}

function truncateJson(value: unknown, maxChars = 3500) {
  const text = JSON.stringify(value);
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars)}…[truncated]`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function slimParameters(tool: McpToolDefinition): Record<string, unknown> {
  if (SLIM_PARAMS[tool.name]) {
    return SLIM_PARAMS[tool.name];
  }

  const properties = tool.inputSchema?.properties ?? {};
  const slimProps: Record<string, unknown> = {};
  for (const key of Object.keys(properties).slice(0, 8)) {
    slimProps[key] = { type: "string" };
  }

  return {
    type: "object",
    additionalProperties: false,
    properties: slimProps,
    required: (tool.inputSchema?.required ?? []).filter((key) => key in slimProps)
  };
}

const TOOL_DESCRIPTIONS: Record<string, string> = {
  get_saved_addresses_for_user: "Return saved delivery addresses. Pick one automatically; never ask the user.",
  get_restaurants_for_keyword:
    "Search restaurants/dishes by keyword for an address_id. Restaurant results often already include items with variant_id.",
  get_menu_items_listing: "List menu item_mappings for a restaurant. Each mapping has variant_id and item_name.",
  get_restaurant_menu_by_categories: "Fetch menu items by category for a restaurant.",
  create_cart:
    "Create a cart for pricing. Always use payment_type cash_on_delivery and items[{variant_id,quantity}]. Never ask the user.",
  get_addresses: "List Swiggy delivery addresses.",
  search_restaurants: "Search Swiggy restaurants.",
  search_menu: "Search Swiggy menu items.",
  update_food_cart: "Add items to the Swiggy cart.",
  get_food_cart: "Read Swiggy cart totals.",
  flush_food_cart: "Clear the Swiggy cart."
};

function toGroqTools(mcpTools: McpToolDefinition[], platform: Platform): GroqTool[] {
  const allowed = platform === "ZOMATO" ? ZOMATO_ALLOWED : SWIGGY_ALLOWED;

  const tools: GroqTool[] = mcpTools
    .filter((tool) => allowed.has(tool.name))
    .map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: TOOL_DESCRIPTIONS[tool.name] ?? (tool.description ?? tool.name).slice(0, 160),
        parameters: slimParameters(tool)
      }
    }));

  tools.push({
    type: "function",
    function: {
      name: SUBMIT_TOOL,
      description: "Submit final payable price once cart totals are known. Never ask the user questions.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          restaurantName: { type: "string" },
          itemName: { type: "string" },
          itemPrice: { type: "number" },
          packagingFee: { type: "number" },
          deliveryFee: { type: "number" },
          platformFee: { type: "number" },
          taxes: { type: "number" },
          discount: { type: "number" },
          finalPrice: { type: "number" },
          restaurantId: { type: "string" },
          itemId: { type: "string" },
          addressId: { type: "string" }
        },
        required: ["restaurantName", "itemName", "itemPrice", "finalPrice"]
      }
    }
  });

  return tools;
}

function systemPrompt(platform: Platform, location: Location, intent?: SearchIntent) {
  const dish = intent?.dishQuery ?? "";
  if (platform === "ZOMATO") {
    return `Zomato pricing agent. You are fully autonomous — never ask the user questions.
Dish: ${dish}
Dietary: ${intent?.dietary ?? "any"}
Pick address near: ${location.label ?? "Home"} / ${location.address ?? ""}
Rules:
- Only pick an item whose name clearly matches the dish (${dish}). Never substitute an unrelated item (e.g. dessert for a curry/meal).
- Prefer the best name match first, then cheapest among close matches.
- Always use payment_type "cash_on_delivery". Never ask about payment.
- create_cart items must use variant_id (starts with "v_"), not item_id/catalogue_id.
- Flow: get_saved_addresses_for_user → get_restaurants_for_keyword → create_cart → ${SUBMIT_TOOL}.
- If restaurant.items already includes a matching variant_id, skip menu listing.
- If nothing matches the dish name, fail instead of submitting a random item.
- No lat/lng args. No checkout. Only tool calls + ${SUBMIT_TOOL}.`;
  }

  return `Swiggy pricing agent. You are fully autonomous — never ask the user questions.
Dish: ${dish}
Address hint: ${location.label ?? "Home"} / ${location.address ?? ""}
Rules:
- Only pick menu items whose names clearly match "${dish}".
- Prefer best name match, then cheapest close match.
Flow: get_addresses → search_menu → update_food_cart → get_food_cart → flush_food_cart → ${SUBMIT_TOOL}.`;
}

async function groqChat(messages: ChatMessage[], tools: GroqTool[], attempt = 0) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is required for the pricing agent.");
  }

  const model = process.env.GROQ_AGENT_MODEL || process.env.GROQ_MODEL || "openai/gpt-oss-20b";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      tools,
      tool_choice: "auto",
      messages
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    if (response.status === 429 && attempt < 2) {
      await sleep(parseRetryMs(body));
      return groqChat(messages, tools, attempt + 1);
    }
    throw new Error(`Groq agent failed (${response.status}): ${body.slice(0, 220)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        role?: string;
        content?: string | null;
        tool_calls?: Array<{
          id: string;
          type: "function";
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };

  const message = payload.choices?.[0]?.message;
  if (!message) {
    throw new Error("Groq agent returned an empty response.");
  }

  return message;
}

export async function runMcpPricingAgent(options: {
  platform: Platform;
  client: McpHttpClient;
  query: string;
  location: Location;
  intent?: SearchIntent;
  maxSteps?: number;
}): Promise<NormalizedPrice> {
  const { platform, client, query, location, intent } = options;
  const maxSteps = options.maxSteps ?? 8;
  const dishQuery = intent?.dishQuery || query;

  await client.initialize().catch(() => undefined);
  const mcpTools = await client.listTools();
  const tools = toGroqTools(mcpTools, platform);

  if (tools.length <= 1) {
    throw new McpToolError(`${platform} MCP exposed no usable pricing tools.`);
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(platform, location, intent) },
    {
      role: "user",
      content: `Return the final payable price for: ${dishQuery}${
        intent?.restaurantHint ? ` @ ${intent.restaurantHint}` : ""
      }. Choose dish and payment yourself. Do not ask questions.`
    }
  ];

  const trace: Array<{ tool: string; ok: boolean; error?: string }> = [];

  for (let step = 0; step < maxSteps; step += 1) {
    const message = await groqChat(messages, tools);

    if (message.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: message.content ?? null,
        tool_calls: message.tool_calls
      });

      for (const call of message.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = asRecord(JSON.parse(call.function.arguments || "{}")) ?? {};
        } catch {
          args = {};
        }

        if (call.function.name === SUBMIT_TOOL) {
          const parsed = priceResultSchema.parse(args);
          if (intent?.maxFinalPrice && parsed.finalPrice > intent.maxFinalPrice) {
            throw new McpToolError(
              `${platform} match ₹${parsed.finalPrice} exceeds your max ₹${intent.maxFinalPrice}.`
            );
          }

          return {
            platform,
            restaurantName: parsed.restaurantName,
            itemName: parsed.itemName,
            itemPrice: parsed.itemPrice,
            packagingFee: parsed.packagingFee,
            deliveryFee: parsed.deliveryFee,
            platformFee: parsed.platformFee,
            taxes: parsed.taxes,
            discount: parsed.discount,
            finalPrice: parsed.finalPrice,
            currency: "INR",
            rawMetadata: {
              adapter: `${platform.toLowerCase()}-mcp-agent`,
              restaurantId: parsed.restaurantId ?? null,
              itemId: parsed.itemId ?? null,
              addressId: parsed.addressId ?? null,
              dishQuery,
              intent: intent ?? null,
              agentTrace: trace
            }
          };
        }

        try {
          const result = await client.callTool(call.function.name, args);
          trace.push({ tool: call.function.name, ok: true });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: truncateJson(result)
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          trace.push({ tool: call.function.name, ok: false, error: errorMessage });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.function.name,
            content: truncateJson({ error: errorMessage })
          });
        }
      }
      continue;
    }

    const content = message.content?.trim();
    if (content) {
      // Models sometimes ask clarifying questions; force an autonomous finish instead.
      messages.push({ role: "assistant", content });
      messages.push({
        role: "user",
        content:
          "Do not ask questions. Autonomously pick the best matching dish, use payment_type cash_on_delivery for Zomato (or continue Swiggy cart tools), then call submit_price_result with numeric totals."
      });
      continue;
    }
    break;
  }

  throw new McpToolError(
    `${platform} pricing agent did not submit a price after ${maxSteps} steps. Tools tried: ${
      trace.map((entry) => entry.tool).join(", ") || "none"
    }.`
  );
}
