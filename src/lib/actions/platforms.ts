"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";

import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { platformAccounts, type Platform } from "@/lib/db/schema";
import {
  completeZomatoOAuthFromCallback,
  parseZomatoCallbackInput
} from "@/lib/platforms/zomato-oauth";
import { encrypt } from "@/lib/security/encryption";

const platforms = ["SWIGGY", "ZOMATO"] as const;

function parsePlatform(value: FormDataEntryValue | null): Platform {
  if (typeof value === "string" && platforms.includes(value as Platform)) {
    return value as Platform;
  }

  throw new Error("Unsupported platform");
}

export async function completeZomatoOAuthPasteAction(formData: FormData) {
  const session = await requireAuth();
  const raw = typeof formData.get("callback") === "string" ? String(formData.get("callback")) : "";
  const parsed = parseZomatoCallbackInput(raw);

  if (!parsed) {
    redirect("/accounts?zomato=invalid_paste");
  }

  const result = await completeZomatoOAuthFromCallback(session.user.id, parsed.code, parsed.state);
  if (!result.ok) {
    redirect(`/accounts?zomato=${result.reason}`);
  }

  revalidatePath("/accounts");
  revalidatePath("/compare");
  redirect("/accounts?zomato=connected");
}

export async function connectZomatoMcpAction() {
  const session = await requireAuth();

  if (process.env.ZOMATO_MCP_ENABLED !== "true") {
    redirect("/accounts?zomato=mcp_disabled");
  }

  const accessToken = process.env.ZOMATO_MCP_ACCESS_TOKEN;
  if (!accessToken) {
    redirect("/accounts?zomato=missing_token");
  }

  const encryptedSessionData = encrypt(
    JSON.stringify({
      mode: "mcp_token",
      access_token: accessToken,
      connectedAt: new Date().toISOString()
    })
  );

  await db
    .insert(platformAccounts)
    .values({
      userId: session.user.id,
      platform: "ZOMATO",
      status: "CONNECTED",
      encryptedSessionData,
      metadata: {
        authType: "mcp_token",
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
          authType: "mcp_token",
          endpoint: process.env.ZOMATO_MCP_URL ?? "https://mcp-server.zomato.com/mcp"
        },
        updatedAt: new Date(),
        lastVerifiedAt: new Date()
      }
    });

  revalidatePath("/accounts");
  revalidatePath("/compare");
  redirect("/accounts?zomato=connected");
}

export async function disconnectPlatformAction(formData: FormData) {
  const session = await requireAuth();
  const platform = parsePlatform(formData.get("platform"));

  await db
    .update(platformAccounts)
    .set({
      status: "DISCONNECTED",
      encryptedSessionData: null,
      metadata: {},
      updatedAt: new Date()
    })
    .where(and(eq(platformAccounts.userId, session.user.id), eq(platformAccounts.platform, platform)));

  revalidatePath("/accounts");
  revalidatePath("/compare");
}
