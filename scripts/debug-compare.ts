import { eq } from "drizzle-orm";

import { parseNaturalLanguageSearch } from "../src/lib/ai/groq-search";
import { db } from "../src/lib/db";
import { addresses } from "../src/lib/db/schema";
import { getAdapter } from "../src/lib/platforms/registry";
import { getPlatformSession } from "../src/lib/platforms/session";

async function main() {
  const userId = "30f085be-84d5-40a2-b7f0-1f04d31b8ed4";
  const session = await getPlatformSession(userId, "ZOMATO");
  if (!session?.accessToken) {
    throw new Error("No Zomato session");
  }

  const { McpHttpClient } = await import("../src/lib/platforms/mcp-client");
  const client = new McpHttpClient(
    process.env.ZOMATO_MCP_URL ?? "https://mcp-server.zomato.com/mcp",
    session.accessToken
  );
  await client.initialize().catch((error: unknown) => {
    console.log("initialize error", error instanceof Error ? error.message : error);
  });
  const tools = await client.listTools();
  console.log(
    "tools",
    tools.map((tool) => tool.name)
  );

  for (const name of [
    "get_user_addresses",
    "get_addresses",
    "list_addresses",
    "get_saved_addresses",
    "fetch_addresses",
    "get_serviceable_location",
    "set_location",
    "search_location"
  ]) {
    if (!tools.some((tool) => tool.name === name)) {
      continue;
    }
    try {
      const payload = await client.callTool(name, {});
      const preview = JSON.stringify(payload)?.slice(0, 1200);
      console.log("\nTOOL", name, preview);
    } catch (error) {
      console.log("\nTOOL", name, "ERR", error instanceof Error ? error.message : error);
    }
  }

  const [address] = await db.select().from(addresses).where(eq(addresses.userId, userId)).limit(1);
  const intent = await parseNaturalLanguageSearch("biryani under 400");
  const location = {
    label: address.label,
    address: address.address,
    latitude: Number(address.latitude),
    longitude: Number(address.longitude)
  };
  console.log("\npricing with lat/lng", location.latitude, location.longitude);
  try {
    const adapter = getAdapter("ZOMATO");
    const results = await adapter.getPricing({
      query: intent.dishQuery,
      location,
      intent,
      session: {
        mode: session.mode,
        accessToken: session.accessToken,
        userId,
        markExpired: async (reason: string) => console.log("expired", reason)
      }
    });
    console.log("pricing ok", results.length);
  } catch (error) {
    console.log("pricing ERR", error instanceof Error ? error.message : error);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
