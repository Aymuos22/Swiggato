"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { parseNaturalLanguageSearch } from "@/lib/ai/groq-search";
import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { addresses, comparisons, priceResults, savedRestaurants, type Platform } from "@/lib/db/schema";
import { getAdapter } from "@/lib/platforms/registry";
import {
  listConnectedPlatformSessions,
  markPlatformExpired,
  type PlatformSession
} from "@/lib/platforms/session";
import type { AdapterSessionContext, Location, NormalizedPrice } from "@/lib/platforms/types";

const compareSchema = z.object({
  query: z.string().min(2),
  addressId: z.string().uuid()
});

const REQUIRED_PLATFORMS: Platform[] = ["SWIGGY", "ZOMATO"];

function decimal(value: number) {
  return value.toFixed(2);
}

function toAdapterSession(session: PlatformSession, userId: string): AdapterSessionContext {
  return {
    mode: session.mode,
    accessToken: session.accessToken,
    userId,
    markExpired: async (reason: string) => {
      await markPlatformExpired(userId, session.platform, reason);
    }
  };
}

export type CompareState = {
  error?: string;
  warning?: string;
  comparisonId?: string;
  clarifiedQuery?: string;
};

export async function comparePricesAction(
  _state: CompareState,
  formData: FormData
): Promise<CompareState> {
  const session = await requireAuth();
  const parsed = compareSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: "Enter a natural-language food request and choose an address." };
  }

  if (!process.env.GROQ_API_KEY) {
    return { error: "Set GROQ_API_KEY in your environment to enable natural-language search." };
  }

  const [address] = await db
    .select()
    .from(addresses)
    .where(and(eq(addresses.userId, session.user.id), eq(addresses.id, parsed.data.addressId)))
    .limit(1);

  if (!address) {
    return { error: "Selected address was not found." };
  }

  const connected = await listConnectedPlatformSessions(session.user.id);
  const byPlatform = new Map(connected.map((item) => [item.platform, item]));
  const missing = REQUIRED_PLATFORMS.filter((platform) => !byPlatform.has(platform));

  if (missing.length > 0) {
    return {
      error: `Connect both live MCPs before comparing. Missing: ${missing.join(" and ")}. Use Start OAuth on Accounts (mocks are disabled).`
    };
  }

  let intent;
  try {
    intent = await parseNaturalLanguageSearch(parsed.data.query);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to parse natural-language search with Groq."
    };
  }

  const location: Location = {
    label: address.label,
    address: address.address,
    latitude: Number(address.latitude),
    longitude: Number(address.longitude)
  };

  const settled = await Promise.allSettled(
    REQUIRED_PLATFORMS.map(async (platform) => {
      const platformSession = byPlatform.get(platform)!;
      const adapter = getAdapter(platform);
      const results = await adapter.getPricing({
        query: intent.dishQuery,
        location,
        intent,
        session: toAdapterSession(platformSession, session.user.id)
      });

      return { platform, results };
    })
  );

  const allResults: NormalizedPrice[] = [];
  const errors: string[] = [];

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      allResults.push(...outcome.value.results);
    } else {
      errors.push(
        outcome.reason instanceof Error ? outcome.reason.message : "One platform search failed."
      );
    }
  }

  if (allResults.length === 0) {
    return {
      error: errors[0] ?? "No live prices were returned from Swiggy or Zomato MCP.",
      clarifiedQuery: intent.clarifiedQuery
    };
  }

  const [comparison] = await db
    .insert(comparisons)
    .values({
      userId: session.user.id,
      searchQuery: intent.clarifiedQuery,
      addressId: address.id
    })
    .returning();

  await db.insert(priceResults).values(
    allResults.map((result) => ({
      comparisonId: comparison.id,
      platform: result.platform,
      restaurantName: result.restaurantName,
      itemName: result.itemName,
      itemPrice: decimal(result.itemPrice),
      packagingFee: decimal(result.packagingFee),
      deliveryFee: decimal(result.deliveryFee),
      platformFee: decimal(result.platformFee),
      taxes: decimal(result.taxes),
      discount: decimal(result.discount),
      finalPrice: decimal(result.finalPrice),
      currency: result.currency,
      rawMetadata: {
        ...(result.rawMetadata ?? {}),
        naturalLanguageQuery: parsed.data.query,
        intent,
        partialErrors: errors
      }
    }))
  );

  for (const result of allResults) {
    const restaurantId = result.rawMetadata?.restaurantId;
    if (typeof restaurantId !== "string" || !restaurantId) {
      continue;
    }

    const existing = await db
      .select({ id: savedRestaurants.id })
      .from(savedRestaurants)
      .where(
        and(
          eq(savedRestaurants.userId, session.user.id),
          eq(savedRestaurants.platform, result.platform),
          eq(savedRestaurants.platformRestaurantId, restaurantId)
        )
      )
      .limit(1);

    if (existing.length === 0) {
      await db.insert(savedRestaurants).values({
        userId: session.user.id,
        platform: result.platform,
        platformRestaurantId: restaurantId,
        name: result.restaurantName,
        metadata: { source: "compare", itemName: result.itemName }
      });
    }
  }

  revalidatePath("/compare");
  revalidatePath("/history");
  revalidatePath("/dashboard");

  return {
    comparisonId: comparison.id,
    clarifiedQuery: intent.clarifiedQuery,
    warning: errors.length > 0 ? errors.join(" ") : undefined
  };
}

export async function getRecentComparisons(userId: string) {
  return db
    .select()
    .from(comparisons)
    .where(eq(comparisons.userId, userId))
    .orderBy(desc(comparisons.createdAt))
    .limit(10);
}
