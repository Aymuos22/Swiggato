import "server-only";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { platformAccounts, type Platform, type PlatformStatus } from "@/lib/db/schema";
import { decrypt } from "@/lib/security/encryption";

export type PlatformSession = {
  accountId: string;
  platform: Platform;
  status: PlatformStatus;
  mode: "oauth" | "mcp_token";
  accessToken: string;
  metadata: Record<string, unknown>;
  raw: Record<string, unknown>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function markPlatformExpired(userId: string, platform: Platform, reason: string) {
  await db
    .update(platformAccounts)
    .set({
      status: "EXPIRED",
      metadata: { reason, expiredAt: new Date().toISOString() },
      updatedAt: new Date()
    })
    .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.platform, platform)));
}

export async function getPlatformSession(
  userId: string,
  platform: Platform
): Promise<PlatformSession | null> {
  const [account] = await db
    .select()
    .from(platformAccounts)
    .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.platform, platform)))
    .limit(1);

  if (!account || account.status !== "CONNECTED" || !account.encryptedSessionData) {
    return null;
  }

  const raw = asRecord(JSON.parse(decrypt(account.encryptedSessionData)));
  const metadata = asRecord(account.metadata);

  if (raw.mode === "mock" || metadata.mode === "mock" || metadata.authType === "mock") {
    await db
      .update(platformAccounts)
      .set({
        status: "DISCONNECTED",
        encryptedSessionData: null,
        metadata: { reason: "Mock connections are disabled" },
        updatedAt: new Date()
      })
      .where(eq(platformAccounts.id, account.id));
    return null;
  }

  const accessToken =
    (typeof raw.access_token === "string" && raw.access_token) ||
    (typeof raw.accessToken === "string" && raw.accessToken) ||
    undefined;

  if (!accessToken) {
    return null;
  }

  const expiresAt =
    (typeof raw.expires_at === "string" && raw.expires_at) ||
    (typeof metadata.expiresAt === "string" && metadata.expiresAt) ||
    undefined;

  if (expiresAt && Date.parse(expiresAt) <= Date.now()) {
    await markPlatformExpired(userId, platform, "Access token expired");
    return null;
  }

  const mode: "oauth" | "mcp_token" =
    metadata.authType === "mcp_token" || raw.mode === "mcp_token" ? "mcp_token" : "oauth";

  return {
    accountId: account.id,
    platform,
    status: account.status,
    mode,
    accessToken,
    metadata,
    raw
  };
}

export async function listConnectedPlatformSessions(userId: string) {
  const accounts = await db
    .select()
    .from(platformAccounts)
    .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.status, "CONNECTED")));

  const sessions: PlatformSession[] = [];

  for (const account of accounts) {
    const session = await getPlatformSession(userId, account.platform);
    if (session) {
      sessions.push(session);
    }
  }

  return sessions;
}
