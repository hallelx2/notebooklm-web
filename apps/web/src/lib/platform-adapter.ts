import { getStorage } from "@notebooklm/core/storage";
import type { PlatformAdapter } from "@notebooklm/server";
import { db } from "@/db";
import { auth } from "@/lib/auth";

/**
 * The web app's PlatformAdapter. Wired into the Hono app via `createApp` and
 * delegated to from the Next.js catch-all route.
 */
export const webAdapter: PlatformAdapter = {
  db,
  auth,
  storage: getStorage(),
  env: {
    APP_URL:
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.BETTER_AUTH_URL ??
      "http://localhost:3000",
    DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
    EXA_API_KEY: process.env.EXA_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    SERPAPI_KEY: process.env.SERPAPI_KEY,
  },
};
