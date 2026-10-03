import "server-only";

export class McpAuthError extends Error {
  constructor(message = "MCP authentication failed") {
    super(message);
    this.name = "McpAuthError";
  }
}

export class McpToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolError";
  }
}

export type McpToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown };
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractFromSse(body: string): unknown {
  const dataLines = body
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trim())
    .filter(Boolean);

  for (let index = dataLines.length - 1; index >= 0; index -= 1) {
    const parsed = tryParseJson(dataLines[index]);
    if (parsed) {
      return parsed;
    }
  }

  return tryParseJson(body);
}

function unwrapToolPayload(result: unknown): unknown {
  const record = asRecord(result);
  if (!record) {
    return result;
  }

  if ("success" in record || "data" in record) {
    return record;
  }

  if ("structuredContent" in record) {
    return record.structuredContent;
  }

  const content = record.content;
  if (Array.isArray(content)) {
    for (const entry of content) {
      const item = asRecord(entry);
      if (!item) {
        continue;
      }

      if (item.type === "text" && typeof item.text === "string") {
        const parsed = tryParseJson(item.text);
        if (parsed) {
          return parsed;
        }
      }

      if (item.type === "json" && "json" in item) {
        return item.json;
      }
    }
  }

  return result;
}

/** Fallback allowlists when a server omits inputSchema.properties. */
const KNOWN_ARG_ALLOWLIST: Record<string, string[]> = {
  get_restaurants_for_keyword: ["address_id", "keyword", "page_size", "filter", "postback_params"],
  get_menu_items_listing: ["res_id", "address_id", "menu_filter"],
  get_restaurant_menu_by_categories: ["res_id", "categories", "address_id", "menu_filter"],
  get_saved_addresses_for_user: [],
  create_cart: ["res_id", "items", "address_id", "payment_type", "promo_code"],
  checkout_cart: ["cart_id", "payment_method_type"],
  get_order_history: [
    "address_id",
    "search_query",
    "request_type",
    "has_more",
    "postback_params",
    "start_date",
    "end_date"
  ],
  get_order_tracking_info: ["order_id"],
  get_addresses: ["page", "pageSize"],
  search_menu: ["addressId", "query", "vegFilter", "restaurantIdOfAddedItem"],
  search_restaurants: ["addressId", "query"],
  update_food_cart: ["restaurantId", "restaurantName", "addressId", "cartItems"],
  get_food_cart: ["addressId", "restaurantName"],
  flush_food_cart: []
};

export function filterToolArguments(
  toolName: string,
  args: Record<string, unknown>,
  inputSchema?: McpToolDefinition["inputSchema"]
) {
  const properties = inputSchema?.properties;
  const allowed = properties
    ? new Set(Object.keys(properties))
    : new Set(KNOWN_ARG_ALLOWLIST[toolName] ?? Object.keys(args));

  // Tools with empty property maps (and empty allowlist) take no args.
  if (properties && Object.keys(properties).length === 0) {
    return {};
  }

  if (!properties && KNOWN_ARG_ALLOWLIST[toolName] && KNOWN_ARG_ALLOWLIST[toolName].length === 0) {
    return {};
  }

  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (value === undefined) {
      continue;
    }
    if (allowed.has(key)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export class McpHttpClient {
  private sessionId?: string;
  private initialized = false;
  private toolSchemas = new Map<string, McpToolDefinition["inputSchema"]>();

  constructor(
    private readonly endpoint: string,
    private readonly accessToken: string
  ) {}

  private headers() {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream"
    };

    if (this.sessionId) {
      headers["Mcp-Session-Id"] = this.sessionId;
    }

    return headers;
  }

  private async rpc(method: string, params?: Record<string, unknown>) {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Date.now(),
        method,
        ...(params ? { params } : {})
      }),
      cache: "no-store"
    });

    const sessionHeader = response.headers.get("mcp-session-id");
    if (sessionHeader) {
      this.sessionId = sessionHeader;
    }

    if (response.status === 401 || response.status === 403 || response.status === 419) {
      throw new McpAuthError(`MCP auth failed with HTTP ${response.status}`);
    }

    const rawBody = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const payload =
      contentType.includes("text/event-stream") || rawBody.includes("data:")
        ? extractFromSse(rawBody)
        : tryParseJson(rawBody);

    if (!response.ok) {
      throw new McpToolError(`MCP HTTP ${response.status}: ${rawBody.slice(0, 300)}`);
    }

    const rpc = asRecord(payload) as JsonRpcResponse | null;
    if (!rpc) {
      throw new McpToolError("MCP returned a non-JSON response");
    }

    if (rpc.error) {
      const code = rpc.error.code;
      if (code === -32001 || code === 401 || code === 403) {
        throw new McpAuthError(rpc.error.message ?? "MCP session expired");
      }
      throw new McpToolError(rpc.error.message ?? "MCP tool call failed");
    }

    return rpc.result;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    await this.rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: {
        name: "swiggato",
        version: "0.1.0"
      }
    });

    await fetch(this.endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/initialized"
      }),
      cache: "no-store"
    }).catch(() => undefined);

    this.initialized = true;
  }

  getToolSchema(name: string) {
    return this.toolSchemas.get(name);
  }

  async listTools(): Promise<McpToolDefinition[]> {
    if (!this.initialized) {
      await this.initialize().catch(() => undefined);
    }

    const result = await this.rpc("tools/list", {});
    const record = asRecord(result);
    const tools = Array.isArray(record?.tools) ? record.tools : Array.isArray(result) ? result : [];

    const listed: McpToolDefinition[] = [];
    this.toolSchemas.clear();

    for (const tool of tools) {
      const item = asRecord(tool);
      if (!item || typeof item.name !== "string") {
        continue;
      }

      const inputSchema = asRecord(item.inputSchema) as McpToolDefinition["inputSchema"] | null;
      const definition: McpToolDefinition = {
        name: item.name,
        ...(typeof item.description === "string" ? { description: item.description } : {}),
        ...(inputSchema ? { inputSchema } : {})
      };

      this.toolSchemas.set(item.name, definition.inputSchema);
      listed.push(definition);
    }

    return listed;
  }

  async callTool<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.initialized) {
      await this.initialize().catch(() => undefined);
    }

    if (this.toolSchemas.size === 0) {
      await this.listTools().catch(() => undefined);
    }

    const filteredArgs = filterToolArguments(name, args, this.toolSchemas.get(name));

    const result = await this.rpc("tools/call", {
      name,
      arguments: filteredArgs
    });

    const raw = asRecord(result);
    if (raw?.isError === true) {
      const content = Array.isArray(raw.content) ? raw.content : [];
      const text = content
        .map((entry) => {
          const item = asRecord(entry);
          return typeof item?.text === "string" ? item.text : "";
        })
        .filter(Boolean)
        .join(" ");
      throw new McpToolError(text || `${name} failed`);
    }

    const unwrapped = unwrapToolPayload(result);
    const toolResult = asRecord(unwrapped);

    if (toolResult && toolResult.success === false) {
      const error = asRecord(toolResult.error);
      throw new McpToolError(
        (typeof error?.message === "string" && error.message) ||
          (typeof toolResult.message === "string" && toolResult.message) ||
          `${name} failed`
      );
    }

    if (toolResult && "data" in toolResult) {
      return toolResult.data as T;
    }

    const nestedResult = asRecord(toolResult?.result);
    if (nestedResult && ("addresses" in nestedResult || "success" in nestedResult || "data" in nestedResult)) {
      return nestedResult as T;
    }

    return unwrapped as T;
  }
}
