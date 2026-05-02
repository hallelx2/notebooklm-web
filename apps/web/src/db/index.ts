import { neonConfig, Pool } from "@neondatabase/serverless";
import { bindCoreRuntime } from "@notebooklm/core/runtime";
import * as schema from "@notebooklm/core/db/schema";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });
export type WebDatabase = typeof db;

// Bind the core runtime so packages/core libraries see the same db instance
// when called from anywhere in apps/web. Step 3 will replace this side-effect
// with explicit adapter passing via tRPC ctx.
bindCoreRuntime({ db });
