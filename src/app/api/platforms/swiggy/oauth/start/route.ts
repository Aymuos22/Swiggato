import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { attachOAuthPendingCookie, oauthLaunchHtml } from "@/lib/platforms/oauth-cookies";

function base64Url(buffer: Buffer) {
  return buffer.toString("base64url");
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({
    headers: request.headers
  });

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const baseUrl = process.env.SWIGGY_OAUTH_BASE_URL ?? "https://mcp.swiggy.com";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
  const redirectUri = `${appUrl}/api/platforms/swiggy/oauth/callback`;
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const state = base64Url(randomBytes(32));

  const registrationResponse = await fetch(`${baseUrl}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Swiggato",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    }),
    cache: "no-store"
  });

  if (!registrationResponse.ok) {
    return NextResponse.redirect(new URL("/accounts?swiggy=registration_failed", request.url));
  }

  const registration = (await registrationResponse.json()) as { client_id?: string };

  if (!registration.client_id) {
    return NextResponse.redirect(new URL("/accounts?swiggy=missing_client", request.url));
  }

  const authorizationUrl = new URL(`${baseUrl}/auth/authorize`);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", registration.client_id);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("scope", "mcp:tools mcp:resources");

  const response = new NextResponse(oauthLaunchHtml("Swiggy", authorizationUrl.toString()), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

  return attachOAuthPendingCookie(
    response,
    "swiggy_oauth_pending",
    {
      state,
      verifier,
      clientId: registration.client_id,
      redirectUri,
      createdAt: new Date().toISOString()
    },
    request.url
  );
}
