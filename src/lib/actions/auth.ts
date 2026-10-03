"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().transform((value) => value.toLowerCase()),
  phoneNumber: z.string().regex(/^\+[1-9]\d{7,14}$/, "Use E.164 format, for example +919876543210"),
  password: z.string().min(8)
});

export type FormState = {
  ok?: boolean;
  error?: string;
};

export async function registerAction(_state: FormState, formData: FormData): Promise<FormState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid registration details." };
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, parsed.data.email))
    .limit(1);

  if (existing.length > 0) {
    return { error: "An account already exists for this email." };
  }

  const userCount = await db.select({ id: users.id }).from(users).limit(1);

  const result = await auth.api.signUpEmail({
    headers: await headers(),
    body: {
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      phoneNumber: parsed.data.phoneNumber
    }
  });

  if (!result.user?.id) {
    return { error: "Registration failed." };
  }

  await db.update(users).set({
    phoneNumber: parsed.data.phoneNumber,
    role: userCount.length === 0 ? "ADMIN" : "USER",
    lastLoginAt: new Date(),
    updatedAt: new Date()
  }).where(eq(users.id, result.user.id));

  redirect("/dashboard");
}

export async function loginAction(_state: FormState, formData: FormData): Promise<FormState> {
  try {
    const email = String(formData.get("email") ?? "").toLowerCase();
    await auth.api.signInEmail({
      headers: await headers(),
      body: {
        email,
        password: String(formData.get("password") ?? ""),
        rememberMe: true
      }
    });
    await db
      .update(users)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(users.email, email));
  } catch (error) {
    return { error: "Invalid email or password." };
  }

  redirect("/dashboard");
}

export async function logoutAction() {
  await auth.api.signOut({
    headers: await headers()
  });
  redirect("/login");
}
