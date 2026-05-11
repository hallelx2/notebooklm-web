import * as dotenv from "dotenv";
import type { Config } from "drizzle-kit";

dotenv.config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not defined");
}

export default {
  // Schema is owned by @notebooklm/core so every adapter (web, desktop)
  // sees the same shape. drizzle-kit walks the file system directly so
  // we point at the workspace path, not the package's export map.
  schema: "../../packages/core/src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
} satisfies Config;
