import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { platformAccounts } from "@/lib/db/schema";
import { readOAuthPendingCookie } from "@/lib/platforms/oauth-cookies";
import { encrypt } from "@/lib/security/encryption";

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const pending = readOAuthPendingCookie(cookieStore.get("swiggy_oauth_pending")?.value, state);

  if (!code || !state || !pending) {
    return NextResponse.redirect(new URL("/accounts?swiggy=invalid_callback", request.url));
  }

  const baseUrl = process.env.SWIGGY_OAUTH_BASE_URL ?? "https://mcp.swiggy.com";

  const tokenResponse = await fetch(`${baseUrl}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      code,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
      redirect_uri: pending.redirectUri
    }),
    cache: "no-store"
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL("/accounts?swiggy=token_failed", request.url));
  }

  const tokenPayload = (await tokenResponse.json()) as Record<string, unknown>;
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
      userId: session.user.id,
      platform: "SWIGGY",
      status: "CONNECTED",
      encryptedSessionData,
      metadata: {
        authType: "oauth_pkce",
        scope: tokenPayload.scope,
        expiresIn,
        expiresAt
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
          expiresAt
        },
        updatedAt: new Date(),
        lastVerifiedAt: new Date()
      }
    });

  const response = NextResponse.redirect(new URL("/accounts?swiggy=connected", request.url));
  response.cookies.set("swiggy_oauth_pending", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: url.protocol === "https:",
    path: "/",
    maxAge: 0
  });
  return response;
}
