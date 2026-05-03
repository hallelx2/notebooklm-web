import type { Auth } from "@notebooklm/core/auth";
import type { Database } from "@notebooklm/core/db";
import type { StorageProvider } from "@notebooklm/core/storage/types";

/**
 * The platform-specific dependencies the server needs at runtime.
 *
 * Each application constructs its own adapter. The web app uses Neon for
 * `db`, Supabase/S3 for `storage`, and reads env from `process.env`. The
 * desktop app uses PGlite, the local filesystem, and a config file. The
 * Hono app and every tRPC router only see the adapter — never `process.env`,
 * never an environment-specific db client.
 */
export type PlatformAdapter = {
  /** Drizzle client bound to a Postgres-flavored db. */
  db: Database;

  /** Better Auth instance; `auth.api.getSession({ headers })` reads sessions. */
  auth: Auth;

  /** File storage interface. Phase 1 stub uses an in-memory Map. */
  storage: StorageProvider;

  /** Env values the handlers consume. Pre-validated by the adapter. */
  env: {
    APP_URL: string;
    DEEPGRAM_API_KEY?: string;
    EXA_API_KEY?: string;
    TAVILY_API_KEY?: string;
    SERPAPI_KEY?: string;
  };
};
