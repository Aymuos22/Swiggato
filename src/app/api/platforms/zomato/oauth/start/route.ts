import { createHash, randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { attachOAuthPendingCookie, oauthLaunchHtml } from "@/lib/platforms/oauth-cookies";
import {
  getZomatoOAuthBaseUrl,
  getZomatoRedirectUri,
  saveZomatoOAuthPending
} from "@/lib/platforms/zomato-oauth";

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

  const baseUrl = getZomatoOAuthBaseUrl();
  const redirectUri = getZomatoRedirectUri();
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const state = base64Url(randomBytes(32));

  const registrationResponse = await fetch(`${baseUrl}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Swiggato",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none"
    }),
    cache: "no-store"
  });

  if (!registrationResponse.ok) {
    return NextResponse.redirect(new URL("/accounts?zomato=registration_failed", request.url));
  }

  const registration = (await registrationResponse.json()) as {
    client_id?: string;
    client_secret?: string;
  };

  if (!registration.client_id) {
    return NextResponse.redirect(new URL("/accounts?zomato=missing_client", request.url));
  }

  const pending = {
    state,
    verifier,
    clientId: registration.client_id,
    clientSecret: registration.client_secret,
    redirectUri,
    createdAt: new Date().toISOString()
  };

  await saveZomatoOAuthPending(session.user.id, pending);

  const authorizationUrl = new URL(`${baseUrl}/authorize`);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", registration.client_id);
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("scope", "mcp:tools mcp:resources");

  const response = new NextResponse(oauthLaunchHtml("Zomato", authorizationUrl.toString()), {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

  return attachOAuthPendingCookie(response, "zomato_oauth_pending", pending, request.url);
}
