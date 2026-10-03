import "server-only";

import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { db } from "@/lib/db";
import { platformAccounts } from "@/lib/db/schema";
import { readOAuthPendingCookie, type OAuthPending } from "@/lib/platforms/oauth-cookies";
import { decrypt, encrypt } from "@/lib/security/encryption";

/** Zomato only allowlists a few redirect URIs; localhost is rejected. */
export const ZOMATO_DEFAULT_REDIRECT_URI = "https://oauth.pstmn.io/v1/callback";

export function getZomatoOAuthBaseUrl() {
  return (process.env.ZOMATO_MCP_URL ?? "https://mcp-server.zomato.com/mcp").replace(/\/mcp\/?$/, "");
}

export function getZomatoRedirectUri() {
  return process.env.ZOMATO_OAUTH_REDIRECT_URI?.trim() || ZOMATO_DEFAULT_REDIRECT_URI;
}

export function parseZomatoCallbackInput(raw: string): { code: string; state: string } | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  try {
    if (value.includes("://") || value.startsWith("?")) {
      const url = value.startsWith("?")
        ? new URL(`https://oauth.pstmn.io/v1/callback${value}`)
        : new URL(value);
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      if (code && state) {
        return { code, state };
      }
    }
  } catch {
    // fall through
  }

  const params = new URLSearchParams(value.includes("=") ? value : "");
  const code = params.get("code");
  const state = params.get("state");
  if (code && state) {
    return { code, state };
  }

  return null;
}

export async function saveZomatoOAuthPending(userId: string, pending: OAuthPending) {
  const encryptedPending = encrypt(JSON.stringify(pending));

  await db
    .insert(platformAccounts)
    .values({
      userId,
      platform: "ZOMATO",
      status: "DISCONNECTED",
      encryptedSessionData: null,
      metadata: {
        pendingOAuth: encryptedPending,
        pendingState: pending.state,
        pendingAt: pending.createdAt
      }
    })
    .onConflictDoUpdate({
      target: [platformAccounts.userId, platformAccounts.platform],
      set: {
        // Keep CONNECTED sessions intact if user restarts OAuth mid-flight.
        encryptedSessionData: null,
        status: "DISCONNECTED",
        metadata: {
          pendingOAuth: encryptedPending,
          pendingState: pending.state,
          pendingAt: pending.createdAt
        },
        updatedAt: new Date()
      }
    });
}

async function readZomatoOAuthPendingFromDb(userId: string, expectedState: string) {
  const [account] = await db
    .select()
    .from(platformAccounts)
    .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.platform, "ZOMATO")))
    .limit(1);

  const encryptedPending = account?.metadata?.pendingOAuth;
  if (typeof encryptedPending !== "string") {
    return null;
  }

  try {
    const pending = JSON.parse(decrypt(encryptedPending)) as OAuthPending;
    if (
      !pending?.state ||
      !pending.verifier ||
      !pending.clientId ||
      !pending.redirectUri ||
      pending.state !== expectedState
    ) {
      return null;
    }
    return pending;
  } catch {
    return null;
  }
}

export async function exchangeZomatoAuthCode(pending: OAuthPending, code: string) {
  // Zomato's /token only reads application/x-www-form-urlencoded (JSON drops code_verifier).
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: pending.clientId,
    code_verifier: pending.verifier,
    redirect_uri: pending.redirectUri
  });

  if (pending.clientSecret) {
    params.set("client_secret", pending.clientSecret);
  }

  const tokenResponse = await fetch(`${getZomatoOAuthBaseUrl()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    cache: "no-store"
  });

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text().catch(() => "");
    console.error("Zomato token exchange failed", tokenResponse.status, detail.slice(0, 400));
    return null;
  }

  return (await tokenResponse.json()) as Record<string, unknown>;
}

export async function persistZomatoOAuthSession(
  userId: string,
  pending: OAuthPending,
  tokenPayload: Record<string, unknown>
) {
  const expiresIn =
    typeof tokenPayload.expires_in === "number"
      ? tokenPayload.expires_in
      : Number(tokenPayload.expires_in) || 432000;
  const obtainedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
  const encryptedSessionData = encrypt(
    JSON.stringify({
      ...tokenPayload,
      client_id: pending.clientId,
      obtained_at: obtainedAt,
      expires_at: expiresAt
    })
  );

  await db
    .insert(platformAccounts)
    .values({
      userId,
      platform: "ZOMATO",
      status: "CONNECTED",
      encryptedSessionData,
      metadata: {
        authType: "oauth_pkce",
        scope: tokenPayload.scope,
        expiresIn,
        expiresAt,
        endpoint: process.env.ZOMATO_MCP_URL ?? "https://mcp-server.zomato.com/mcp"
      },
      lastVerifiedAt: new Date()
    })
    .onConflictDoUpdate({
      target: [platformAccounts.userId, platformAccounts.platform],
      set: {
        status: "CONNECTED",
        encryptedSessionData,
        metadata: {
          authType: "oauth_pkce",
          scope: tokenPayload.scope,
          expiresIn,
          expiresAt,
          endpoint: process.env.ZOMATO_MCP_URL ?? "https://mcp-server.zomato.com/mcp"
        },
        updatedAt: new Date(),
        lastVerifiedAt: new Date()
      }
    });
}

export async function completeZomatoOAuthFromCallback(userId: string, code: string, state: string) {
  const cookieStore = await cookies();
  const pendingFromCookie = readOAuthPendingCookie(cookieStore.get("zomato_oauth_pending")?.value, state);
  const pending = pendingFromCookie ?? (await readZomatoOAuthPendingFromDb(userId, state));

  if (!pending) {
    return { ok: false as const, reason: "invalid_callback" as const };
  }

  const tokenPayload = await exchangeZomatoAuthCode(pending, code);
  if (!tokenPayload) {
    return { ok: false as const, reason: "token_failed" as const };
  }

  await persistZomatoOAuthSession(userId, pending, tokenPayload);
  cookieStore.set("zomato_oauth_pending", "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });

  return { ok: true as const };
}
