"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { savedRestaurants } from "@/lib/db/schema";

const saveSchema = z.object({
  platform: z.enum(["SWIGGY", "ZOMATO"]),
  platformRestaurantId: z.string().min(1),
  name: z.string().min(1)
});

export async function saveRestaurantAction(formData: FormData) {
  const session = await requireAuth();
  const parsed = saveSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return;
  }

  const existing = await db
    .select({ id: savedRestaurants.id })
    .from(savedRestaurants)
    .where(
      and(
        eq(savedRestaurants.userId, session.user.id),
        eq(savedRestaurants.platform, parsed.data.platform),
        eq(savedRestaurants.platformRestaurantId, parsed.data.platformRestaurantId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  await db.insert(savedRestaurants).values({
    userId: session.user.id,
    platform: parsed.data.platform,
    platformRestaurantId: parsed.data.platformRestaurantId,
    name: parsed.data.name,
    metadata: {}
  });

  revalidatePath("/dashboard");
  revalidatePath("/compare");
}

export async function unsaveRestaurantAction(formData: FormData) {
  const session = await requireAuth();
  const restaurantId = String(formData.get("restaurantId") ?? "");

  if (!restaurantId) {
    return;
  }

  await db
    .delete(savedRestaurants)
    .where(and(eq(savedRestaurants.id, restaurantId), eq(savedRestaurants.userId, session.user.id)));

  revalidatePath("/dashboard");
  revalidatePath("/compare");
}
