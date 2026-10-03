# Swiggato

Private Next.js application for comparing **live final payable** food prices across Swiggy MCP and Zomato MCP using natural-language search.

## Stack

- Next.js 16 App Router
- TypeScript
- Tailwind CSS with local shadcn-style primitives
- Better Auth email/password authentication
- Neon PostgreSQL + Drizzle ORM
- Groq Chat Completions for natural-language dish intent
- Swiggy Food MCP (OAuth PKCE)
- Zomato MCP (OAuth PKCE / optional real access token)
- AES-256-GCM encrypted platform session storage

Mocks are intentionally disabled. Only live MCP sessions are accepted.

## Environment

Copy `.env.example` to `.env` and fill values:

```env
DATABASE_URL="postgresql://..."
AUTH_SECRET="..."
BETTER_AUTH_SECRET="..."
BETTER_AUTH_URL="http://localhost:3000"
ENCRYPTION_KEY="base64-32-byte-key-from-openssl-rand-base64-32"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
SWIGGY_OAUTH_BASE_URL="https://mcp.swiggy.com"
ZOMATO_MCP_URL="https://mcp-server.zomato.com/mcp"
GROQ_API_KEY="gsk_..."
GROQ_MODEL="openai/gpt-oss-20b"
```

Optional Zomato static token path (still live MCP, not mock):

```env
ZOMATO_MCP_ENABLED="true"
ZOMATO_MCP_ACCESS_TOKEN="..."
```

## Flow

1. Register / log in.
2. Save a delivery address.
3. Connect **both** platforms with OAuth on `/accounts`.
4. On `/compare`, type natural language, e.g. `cheapest spicy chicken biryani under 350`.
5. Groq extracts dish intent → Swiggy + Zomato MCP run in parallel → final payable comparison is saved.

## Platform notes

### Swiggy
Official OAuth PKCE + Food MCP tools:
`get_addresses` → `search_menu` / `search_restaurants` → `update_food_cart` → `get_food_cart` → flush.

### Zomato
OAuth PKCE against `mcp-server.zomato.com`. Live tools are discovered via `tools/list`, then used for address → restaurant search → menu → `create_cart` (`res_id`, `items`, `address_id`).

Zomato currently allowlists only a few OAuth redirect URIs for some clients. If Start OAuth fails with registration/callback errors, ask Zomato to allowlist:

`{NEXT_PUBLIC_APP_URL}/api/platforms/zomato/oauth/callback`

or use a real MCP access token via `ZOMATO_MCP_*`.

## Local development

```bash
npm install
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`.
