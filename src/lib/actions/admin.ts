"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { platformAccounts, users, type UserRole } from "@/lib/db/schema";

const roleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["ADMIN", "USER"])
});

export async function updateUserRoleAction(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = roleSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return;
  }

  if (parsed.data.userId === admin.user.id && parsed.data.role !== "ADMIN") {
    return;
  }

  if (parsed.data.role === "USER") {
    const otherAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "ADMIN"), ne(users.id, parsed.data.userId)))
      .limit(1);

    if (otherAdmins.length === 0) {
      return;
    }
  }

  await db
    .update(users)
    .set({ role: parsed.data.role as UserRole, updatedAt: new Date() })
    .where(eq(users.id, parsed.data.userId));

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}

export async function adminDisconnectPlatformAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const platform = String(formData.get("platform") ?? "");

  if (!userId || (platform !== "SWIGGY" && platform !== "ZOMATO")) {
    return;
  }

  await db
    .update(platformAccounts)
    .set({
      status: "DISCONNECTED",
      encryptedSessionData: null,
      metadata: {},
      updatedAt: new Date()
    })
    .where(and(eq(platformAccounts.userId, userId), eq(platformAccounts.platform, platform)));

  revalidatePath("/admin/users");
  revalidatePath("/admin");
}
