"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";

import { requireAuth } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { addresses } from "@/lib/db/schema";

const addressSchema = z.object({
  label: z.string().min(1, "Label is required"),
  address: z.string().min(5, "Enter a fuller street address"),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  deliveryInstructions: z.string().optional(),
  isDefault: z.coerce.boolean().optional()
});

export type AddressFormState = {
  error?: string;
  ok?: boolean;
};

export async function reverseGeocodeAction(latitude: number, longitude: number) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(latitude));
    url.searchParams.set("lon", String(longitude));

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Swiggato/1.0 (private food price compare)"
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { display_name?: string };
    return payload.display_name?.trim() || null;
  } catch {
    return null;
  }
}

export async function createAddressAction(
  _state: AddressFormState,
  formData: FormData
): Promise<AddressFormState> {
  const session = await requireAuth();
  const parsed = addressSchema.safeParse({
    ...Object.fromEntries(formData),
    isDefault: formData.get("isDefault") === "true" || formData.get("isDefault") === "on"
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid address details." };
  }

  if (parsed.data.isDefault) {
    await db
      .update(addresses)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(addresses.userId, session.user.id));
  }

  await db.insert(addresses).values({
    userId: session.user.id,
    label: parsed.data.label,
    address: parsed.data.address,
    latitude: String(parsed.data.latitude),
    longitude: String(parsed.data.longitude),
    deliveryInstructions: parsed.data.deliveryInstructions,
    isDefault: Boolean(parsed.data.isDefault)
  });

  revalidatePath("/addresses");
  revalidatePath("/compare");
  return { ok: true };
}

export async function setDefaultAddressAction(formData: FormData) {
  const session = await requireAuth();
  const addressId = String(formData.get("addressId") ?? "");

  await db
    .update(addresses)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(addresses.userId, session.user.id), ne(addresses.id, addressId)));

  await db
    .update(addresses)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(and(eq(addresses.userId, session.user.id), eq(addresses.id, addressId)));

  revalidatePath("/addresses");
  revalidatePath("/compare");
}

export async function deleteAddressAction(formData: FormData) {
  const session = await requireAuth();
  const addressId = String(formData.get("addressId") ?? "");

  await db
    .delete(addresses)
    .where(and(eq(addresses.userId, session.user.id), eq(addresses.id, addressId)));

  revalidatePath("/addresses");
  revalidatePath("/compare");
}
