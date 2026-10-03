import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { completeZomatoOAuthFromCallback } from "@/lib/platforms/zomato-oauth";

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

  if (!code || !state) {
    return NextResponse.redirect(new URL("/accounts?zomato=invalid_callback", request.url));
  }

  const result = await completeZomatoOAuthFromCallback(session.user.id, code, state);
  if (!result.ok) {
    return NextResponse.redirect(new URL(`/accounts?zomato=${result.reason}`, request.url));
  }

  return NextResponse.redirect(new URL("/accounts?zomato=connected", request.url));
}
