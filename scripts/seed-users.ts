import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import { neon } from "@neondatabase/serverless";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/lib/db/schema";
import { users, type UserRole } from "../src/lib/db/schema";

function loadEnv(path: string) {
  if (!existsSync(path)) {
    return;
  }

  const text = readFileSync(path, "utf8");

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const index = line.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();

    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

type SeedUser = {
  name: string;
  email: string;
  phoneNumber: string;
  role: UserRole;
};

const seedUsers: SeedUser[] = [
  {
    name: "Swiggato Admin",
    email: "admin@swiggato.local",
    phoneNumber: "+919900000001",
    role: "ADMIN"
  },
  {
    name: "Swiggato Test User",
    email: "test@swiggato.local",
    phoneNumber: "+919900000002",
    role: "USER"
  }
];

function makePassword() {
  return `${randomBytes(14).toString("base64url")}aA1!`;
}

async function seedUser(
  seed: SeedUser,
  db: ReturnType<typeof drizzle<typeof schema>>,
  auth: any
) {
  const [existing] = await db.select().from(users).where(eq(users.email, seed.email)).limit(1);

  if (existing) {
    await db
      .update(users)
      .set({
        name: seed.name,
        phoneNumber: seed.phoneNumber,
        role: seed.role,
        updatedAt: new Date()
      })
      .where(eq(users.id, existing.id));

    return {
      email: seed.email,
      role: seed.role,
      status: "already_exists"
    };
  }

  const password = makePassword();
  const result = await auth.api.signUpEmail({
    body: {
      name: seed.name,
      email: seed.email,
      password,
      phoneNumber: seed.phoneNumber
    }
  });

  if (!result.user?.id) {
    throw new Error(`Failed to create ${seed.email}`);
  }

  await db
    .update(users)
    .set({
      phoneNumber: seed.phoneNumber,
      role: seed.role,
      updatedAt: new Date()
    })
    .where(eq(users.id, result.user.id));

  return {
    email: seed.email,
    password,
    role: seed.role,
    status: "created"
  };
}

async function main() {
  loadEnv(".env");
  loadEnv(".env.local");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema });
  const auth = betterAuth({
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
    }
  });

  const results = [];

  for (const seed of seedUsers) {
    results.push(await seedUser(seed, db, auth));
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
