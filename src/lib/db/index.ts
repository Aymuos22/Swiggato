import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://foodcompare:foodcompare@localhost:5432/foodcompare";

const sql = neon(databaseUrl);

export const db = drizzle(sql, { schema });
