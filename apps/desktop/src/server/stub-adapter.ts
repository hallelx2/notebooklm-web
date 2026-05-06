import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { createAuth } from "@notebooklm/core/auth";
import { schema } from "@notebooklm/core/db";
import { bindCoreRuntime } from "@notebooklm/core/runtime";
import {
  createLocalStorageProvider,
  createMemoryStorageProvider,
} from "@notebooklm/core/storage";
import type { StorageProvider } from "@notebooklm/core/storage/types";
import type { PlatformAdapter } from "@notebooklm/server";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { ensureSearxng } from "./searxng-manager";

/**
 * Phase 1.5 desktop adapter.
 *
 * What's persistent:
 *   - PGlite directory at <dataDir>/pglite — users, notebooks, sources,
 *     chunks, embeddings, messages, saved provider credentials.
 *   - Local-FS storage at <dataDir>/storage — uploaded PDFs, generated
 *     audio overviews, anything the StorageProvider writes.
 *   - Config at <dataDir>/config.json — the per-install ENCRYPTION_KEY
 *     and BETTER_AUTH_SECRET. Generated on first launch, reused after.
 *
 * Default <dataDir> is `~/.notebooklm`. Override with NOTEBOOKLM_DATA_DIR.
 * Set NOTEBOOKLM_DATA_DIR=memory: to fall back to the original ephemeral
 * stub (PGlite memory + in-memory storage + per-launch keys) for testing.
 *
 * Phase 2 will move this construction into a Tauri/Electron sidecar binary
 * that resolves <dataDir> via `app.getPath('userData')`, but the shape of
 * the adapter doesn't change — same Hono app mounts on top.
 */

let cachedAdapter: PlatformAdapter | null = null;

const MEMORY_MODE = process.env.NOTEBOOKLM_DATA_DIR === "memory:";
const DATA_DIR =
  process.env.NOTEBOOKLM_DATA_DIR && !MEMORY_MODE
    ? process.env.NOTEBOOKLM_DATA_DIR
    : join(homedir(), ".notebooklm");

type DesktopConfig = {
  encryptionKey: string;
  betterAuthSecret: string;
};

function loadOrCreateConfig(): DesktopConfig {
  if (MEMORY_MODE) {
    return {
      encryptionKey: randomBytes(32).toString("hex"),
      betterAuthSecret: randomBytes(32).toString("hex"),
    };
  }

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const configPath = join(DATA_DIR, "config.json");

  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(
        readFileSync(configPath, "utf8"),
      ) as Partial<DesktopConfig>;
      if (raw.encryptionKey && raw.betterAuthSecret) {
        return raw as DesktopConfig;
      }
    } catch {
      // fall through to regenerate
    }
  }

  const fresh: DesktopConfig = {
    encryptionKey: randomBytes(32).toString("hex"),
    betterAuthSecret: randomBytes(32).toString("hex"),
  };
  writeFileSync(configPath, JSON.stringify(fresh, null, 2), { mode: 0o600 });
  // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
  console.warn(
    `[NotebookLM Desktop] generated fresh config at ${configPath}. ` +
      `Treat it like a credential — losing it bricks every saved AI key.`,
  );
  return fresh;
}

function ensureRuntimeEnv(cfg: DesktopConfig) {
  if (!process.env.ENCRYPTION_KEY)
    process.env.ENCRYPTION_KEY = cfg.encryptionKey;
  if (!process.env.BETTER_AUTH_SECRET)
    process.env.BETTER_AUTH_SECRET = cfg.betterAuthSecret;

  // Built-in `local` embed provider stores ONNX model files here. Point it
  // at the desktop data dir so models live alongside PGlite + storage and
  // survive app upgrades. First-use download is ~30 MB for bge-small.
  if (!process.env.NOTEBOOKLM_MODEL_CACHE_DIR && !MEMORY_MODE) {
    const modelDir = join(DATA_DIR, "models");
    if (!existsSync(modelDir)) mkdirSync(modelDir, { recursive: true });
    process.env.NOTEBOOKLM_MODEL_CACHE_DIR = modelDir;
  }

  // Bundled-models directory — set by `bun run build:models` at packaging
  // time. In a packaged Electron build it lives under the app's resources
  // dir; in dev it sits at apps/desktop/resources/. The TTS + embeddings
  // providers prefer this over a runtime HF Hub download when present, so
  // a fresh installation has no model-fetch step on first use.
  if (!process.env.NOTEBOOKLM_BUNDLED_MODELS_DIR) {
    // `__dirname` resolves natively in the CJS bundle that the
    // packaged Electron main process loads via esbuild. In dev
    // (vite ssrLoadModule, ESM), `__dirname` is undefined and we
    // fall back to the standard ESM idiom.
    const here =
      typeof __dirname !== "undefined"
        ? __dirname
        : dirname(fileURLToPath(import.meta.url));
    const candidates: string[] = [];
    // Packaged Electron — process.resourcesPath is set by Electron's main
    // process. We guard the access because the desktop adapter may also
    // be imported from non-Electron scripts (typecheck, demo harnesses).
    // biome-ignore lint/suspicious/noExplicitAny: process.resourcesPath is Electron-only
    const rp = (process as { resourcesPath?: string }).resourcesPath;
    if (typeof rp === "string" && existsSync(rp)) candidates.push(rp);
    // Dev — repo-relative, same path the prebuild script writes to.
    // src/server/ → up 2 → apps/desktop, then resources/.
    candidates.push(resolve(here, "..", "..", "resources"));
    for (const c of candidates) {
      if (existsSync(join(c, "kokoro")) || existsSync(join(c, "embed"))) {
        process.env.NOTEBOOKLM_BUNDLED_MODELS_DIR = c;
        const which = [
          existsSync(join(c, "kokoro")) ? "kokoro" : null,
          existsSync(join(c, "embed")) ? "embed" : null,
        ]
          .filter(Boolean)
          .join(", ");
        console.log(
          `[NotebookLM Desktop] bundled models found at ${c} (${which})`,
        );
        break;
      }
    }
    if (!process.env.NOTEBOOKLM_BUNDLED_MODELS_DIR) {
      console.log(
        "[NotebookLM Desktop] no bundled models directory found — first-use will download from HF Hub. " +
          "Run `bun run build:models` from apps/desktop/ to bundle them.",
      );
    }
  }
}

function buildStorage(): StorageProvider {
  if (MEMORY_MODE) return createMemoryStorageProvider();
  const dir = process.env.DESKTOP_STORAGE_DIR ?? join(DATA_DIR, "storage");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return createLocalStorageProvider(dir);
}

function buildPGlite() {
  if (MEMORY_MODE) {
    return new PGlite("memory://", { extensions: { vector } });
  }
  const dbDir = join(DATA_DIR, "pglite");
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  return new PGlite(dbDir, { extensions: { vector } });
}

export type GetStubAdapterOptions = {
  /**
   * Origin the local API server is reachable at, e.g.
   * `http://127.0.0.1:53842`. Better Auth stamps cookies for this
   * origin and rejects sign-in requests whose `Origin` header isn't
   * in `trustedOrigins`, so the value has to match exactly what the
   * renderer fetches against.
   *
   * Omitted for the dev path (vite middleware mode) — the legacy
   * `http://localhost:5173` origin keeps that working.
   */
  baseURL?: string;
};

const DEV_BASE_URL = "http://localhost:5173";

export async function getStubAdapter(
  options: GetStubAdapterOptions = {},
): Promise<PlatformAdapter> {
  if (cachedAdapter) return cachedAdapter;

  const baseURL = options.baseURL ?? DEV_BASE_URL;

  const cfg = loadOrCreateConfig();
  ensureRuntimeEnv(cfg);

  const pg = buildPGlite();
  await pg.waitReady;
  const db = drizzle(pg, { schema });
  bindCoreRuntime({ db });

  await initSchema(db);
  await reapOrphanedJobs(db);

  // Fire-and-forget: spawn SearxNG in the background so deep-research
  // has an OSS web search backend without paid keys. Idempotent — picks
  // up an existing container if one is running, no-ops if Docker isn't
  // available or the user set SEARXNG_URL to an external instance.
  // We don't await: the Hono server should boot immediately even if the
  // image-pull on first run takes a while. The search provider reads
  // process.env.SEARXNG_URL at call time so a delayed set still works.
  if (!MEMORY_MODE) {
    ensureSearxng(DATA_DIR)
      .then((status) => {
        if (status.state === "auto-started") {
          console.log(
            `[NotebookLM Desktop] searxng auto-started at ${status.url} (config: ${status.configDir})`,
          );
        } else if (status.state === "already-running") {
          console.log(`[NotebookLM Desktop] searxng reused at ${status.url}`);
        } else if (status.state === "user-configured") {
          console.log(
            `[NotebookLM Desktop] searxng using user-configured ${status.url}`,
          );
        } else {
          console.log(
            `[NotebookLM Desktop] searxng skipped — ${status.reason}`,
          );
        }
      })
      .catch((err) => {
        console.warn(
          "[NotebookLM Desktop] searxng auto-start failed",
          err instanceof Error ? err.message : err,
        );
      });
  }

  const storage = buildStorage();

  const auth = createAuth({
    db,
    baseURL,
    trustedOrigins: [baseURL],
  });

  cachedAdapter = {
    db,
    auth,
    storage,
    env: {
      APP_URL: baseURL,
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
      KOKORO_BASE_URL: process.env.KOKORO_BASE_URL,
      KOKORO_API_KEY: process.env.KOKORO_API_KEY,
      KOKORO_MODEL: process.env.KOKORO_MODEL,
      KOKORO_LOCAL_MODEL_ID: process.env.KOKORO_LOCAL_MODEL_ID,
      KOKORO_LOCAL_DTYPE: process.env.KOKORO_LOCAL_DTYPE as
        | "fp32"
        | "fp16"
        | "q8"
        | "q4"
        | "q4f16"
        | undefined,
      KOKORO_LOCAL_DEVICE: process.env.KOKORO_LOCAL_DEVICE as
        | "cpu"
        | "webgpu"
        | "wasm"
        | undefined,
      KOKORO_DISABLE_LOCAL: process.env.KOKORO_DISABLE_LOCAL,
      EXA_API_KEY: process.env.EXA_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      SERPAPI_KEY: process.env.SERPAPI_KEY,
    },
  };
  return cachedAdapter;
}

/**
 * Mark every long-running job that's still in `generating` state as
 * `error` on launch. These are orphans — the only thing that could
 * legitimately leave a row in `generating` is an in-flight request
 * handler, and the previous process is by definition dead by the time
 * we boot. Without this, the studio panel's polling loop sees a stale
 * "Generating..." pill that never resolves.
 *
 * Runs once per launch, after the schema is up. Safe on a fresh DB
 * because the UPDATE matches zero rows.
 */
async function reapOrphanedJobs(db: ReturnType<typeof drizzle>) {
  const reaped = await db.execute(sql`
    UPDATE "studio_outputs"
       SET "status" = 'error',
           "content" = jsonb_build_object(
             'error',
             'Interrupted — the desktop app was closed or crashed before this finished.'
           )
     WHERE "status" = 'generating'
     RETURNING "id"
  `);
  const drRows = await db.execute(sql`
    UPDATE "deep_research_runs"
       SET "status" = 'error',
           "error" = 'Interrupted — the desktop app was closed or crashed before this finished.'
     WHERE "status" = 'running'
     RETURNING "id"
  `);
  const total =
    ((reaped.rows ?? reaped) as unknown[]).length +
    ((drRows.rows ?? drRows) as unknown[]).length;
  if (total > 0) {
    console.log(
      `[NotebookLM Desktop] reaped ${total} orphaned job(s) from a previous session`,
    );
  }
}

/**
 * Create every table that packages/core/src/db/schema.ts defines, in
 * dependency order. PGlite supports pgvector when its `vector` extension
 * is loaded, so embedding columns Just Work.
 *
 * `IF NOT EXISTS` everywhere — safe to run every launch against a
 * persistent db without rebuilding existing tables. When the schema in
 * core changes this block needs the matching DDL; Phase 2 swaps for
 * `drizzle-kit migrate` so additive migrations are tracked properly.
 */
async function initSchema(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

  // ── Better Auth tables ─────────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "email" text NOT NULL UNIQUE,
      "email_verified" boolean DEFAULT false NOT NULL,
      "image" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "id" text PRIMARY KEY NOT NULL,
      "expires_at" timestamp NOT NULL,
      "token" text NOT NULL UNIQUE,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp NOT NULL,
      "ip_address" text,
      "user_agent" text,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("user_id")`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "account" (
      "id" text PRIMARY KEY NOT NULL,
      "account_id" text NOT NULL,
      "provider_id" text NOT NULL,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "access_token" text,
      "refresh_token" text,
      "id_token" text,
      "access_token_expires_at" timestamp,
      "refresh_token_expires_at" timestamp,
      "scope" text,
      "password" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("user_id")`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "verification" (
      "id" text PRIMARY KEY NOT NULL,
      "identifier" text NOT NULL,
      "value" text NOT NULL,
      "expires_at" timestamp NOT NULL,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier")`,
  );

  // ── Notebooks + sources + chunks ───────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "notebooks" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "title" text NOT NULL,
      "description" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "sources" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "notebook_id" uuid NOT NULL REFERENCES "notebooks"("id") ON DELETE CASCADE,
      "kind" text NOT NULL,
      "title" text NOT NULL,
      "uri" text,
      "content" text,
      "status" text DEFAULT 'pending' NOT NULL,
      "storage_provider" text,
      "storage_key" text,
      "mime_type" text,
      "size" integer,
      "error" text,
      "metadata" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "sources_notebook_idx" ON "sources" ("notebook_id")`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "source_chunks" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "source_id" uuid NOT NULL REFERENCES "sources"("id") ON DELETE CASCADE,
      "notebook_id" uuid NOT NULL REFERENCES "notebooks"("id") ON DELETE CASCADE,
      "ordinal" integer NOT NULL,
      "content" text NOT NULL,
      "token_count" integer,
      "metadata" jsonb,
      "embedding" vector(768),
      "embedding_dim" integer,
      "embedding_model" text,
      "embedding_provider" text,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "chunks_source_idx" ON "source_chunks" ("source_id")`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "chunks_notebook_idx" ON "source_chunks" ("notebook_id")`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "chunks_embedding_dim_idx" ON "source_chunks" ("notebook_id", "embedding_dim")`,
  );

  // ── Messages, deep research, studio outputs ────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "messages" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "notebook_id" uuid NOT NULL REFERENCES "notebooks"("id") ON DELETE CASCADE,
      "role" text NOT NULL,
      "content" text NOT NULL,
      "citations" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "messages_notebook_idx" ON "messages" ("notebook_id")`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "deep_research_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "notebook_id" uuid NOT NULL REFERENCES "notebooks"("id") ON DELETE CASCADE,
      "query" text NOT NULL,
      "mode" text DEFAULT 'deep' NOT NULL,
      "plan" jsonb,
      "sources" jsonb,
      "report" text,
      "status" text DEFAULT 'running' NOT NULL,
      "error" text,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "deep_research_notebook_idx" ON "deep_research_runs" ("notebook_id")`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "studio_outputs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "notebook_id" uuid NOT NULL REFERENCES "notebooks"("id") ON DELETE CASCADE,
      "kind" text NOT NULL,
      "title" text NOT NULL,
      "content" jsonb,
      "asset_url" text,
      "status" text DEFAULT 'ready' NOT NULL,
      "progress" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  // Additive migration: existing installs already have studio_outputs,
  // so CREATE TABLE IF NOT EXISTS is a no-op. ALTER TABLE ADD COLUMN
  // IF NOT EXISTS handles upgrading them in place.
  await db.execute(
    sql`ALTER TABLE "studio_outputs" ADD COLUMN IF NOT EXISTS "progress" jsonb`,
  );
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "studio_outputs_notebook_idx" ON "studio_outputs" ("notebook_id")`,
  );

  // ── AI provider settings ───────────────────────────────────────
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_provider_credentials" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
      "provider" text NOT NULL,
      "label" text DEFAULT 'default' NOT NULL,
      "api_key_ciphertext" text,
      "api_key_iv" text,
      "api_key_tag" text,
      "api_key_key_version" integer DEFAULT 1 NOT NULL,
      "base_url" text,
      "organization" text,
      "last_validated_at" timestamp,
      "validation_status" text,
      "validation_error" text,
      "metadata" jsonb,
      "created_at" timestamp DEFAULT now() NOT NULL,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);
  await db.execute(
    sql`CREATE INDEX IF NOT EXISTS "user_credentials_user_idx" ON "user_provider_credentials" ("user_id")`,
  );
  await db.execute(
    sql`CREATE UNIQUE INDEX IF NOT EXISTS "user_credentials_user_provider_label_idx" ON "user_provider_credentials" ("user_id", "provider", "label")`,
  );

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_ai_config" (
      "user_id" text PRIMARY KEY REFERENCES "user"("id") ON DELETE CASCADE,
      "chat_provider" text,
      "chat_model" text,
      "embedding_provider" text,
      "embedding_model" text,
      "embedding_dim" integer,
      "onboarded_at" timestamp,
      "preferences" jsonb,
      "updated_at" timestamp DEFAULT now() NOT NULL
    )
  `);

  // ── Multi-dimension embedding tables ───────────────────────────
  // 384 = home of bge-small / MiniLM via the built-in `local` provider.
  // 768/1024/1536/3072 = the rest of the supported pgvector dims.
  for (const dim of [384, 768, 1024, 1536, 3072] as const) {
    const tableName = `chunk_embeddings_${dim}`;
    const idxName = `chunk_embeddings_${dim}_model_idx`;
    await db.execute(
      sql.raw(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        "chunk_id" uuid PRIMARY KEY REFERENCES "source_chunks"("id") ON DELETE CASCADE,
        "provider" text NOT NULL,
        "model" text NOT NULL,
        "embedding" vector(${dim}) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `),
    );
    await db.execute(
      sql.raw(
        `CREATE INDEX IF NOT EXISTS "${idxName}" ON "${tableName}" ("model")`,
      ),
    );
  }
}
