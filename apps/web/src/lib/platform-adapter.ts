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
    KOKORO_BASE_URL: process.env.KOKORO_BASE_URL,
    KOKORO_API_KEY: process.env.KOKORO_API_KEY,
    KOKORO_MODEL: process.env.KOKORO_MODEL,
    // We DON'T force-disable the in-process kokoro-js backend here. The
    // import is lazy — it only runs when a user actually hits the
    // audio-overview endpoint with the Kokoro provider selected. Local
    // `next dev` runs Just Work, and on Vercel the dep would either
    // import-fail (informative error) or run slowly. If you're deploying
    // to a serverless host where you'd rather force only Deepgram or
    // Kokoro-FastAPI, set KOKORO_DISABLE_LOCAL=1 explicitly.
    KOKORO_DISABLE_LOCAL: process.env.KOKORO_DISABLE_LOCAL,
    EXA_API_KEY: process.env.EXA_API_KEY,
    TAVILY_API_KEY: process.env.TAVILY_API_KEY,
    SERPAPI_KEY: process.env.SERPAPI_KEY,
  },
};
