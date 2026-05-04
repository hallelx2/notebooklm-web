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
    /**
     * Base URL for a Kokoro-FastAPI server, e.g. http://localhost:8880/v1.
     * When unset and the in-process backend isn't disabled, the audio
     * handler falls back to `kokoro-js` running in this Node process.
     */
    KOKORO_BASE_URL?: string;
    /** Optional bearer token for Kokoro-FastAPI when auth is enabled. */
    KOKORO_API_KEY?: string;
    /** Override Kokoro-FastAPI model id (default `kokoro`). */
    KOKORO_MODEL?: string;
    /** kokoro-js: HF model id override. */
    KOKORO_LOCAL_MODEL_ID?: string;
    /** kokoro-js: ONNX quantization (`q8` is the default). */
    KOKORO_LOCAL_DTYPE?: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
    /** kokoro-js: execution device (`cpu`, `webgpu`, `wasm`). */
    KOKORO_LOCAL_DEVICE?: "cpu" | "webgpu" | "wasm";
    /** "1" to forbid the in-process kokoro-js backend (web deployments). */
    KOKORO_DISABLE_LOCAL?: string;
    EXA_API_KEY?: string;
    TAVILY_API_KEY?: string;
    SERPAPI_KEY?: string;
  };
};
