import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema
  }),
  emailAndPassword: {
    enabled: true
  },
  user: {
    modelName: "users",
    additionalFields: {
      phoneNumber: {
        type: "string",
        required: true,
        input: true
      },
      role: {
        type: "string",
        required: false,
        defaultValue: "USER",
        input: false
      },
      lastLoginAt: {
        type: "date",
        required: false,
        input: false
      }
    }
  },
  advanced: {
    database: {
      generateId: "uuid",
      validateSchema: false
    }
  },
  plugins: [nextCookies()]
});
