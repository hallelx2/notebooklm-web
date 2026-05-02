import { randomBytes } from "node:crypto";
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

/**
 * Phase 1 stub fills in any env vars the core libraries demand at runtime
 * but the desktop has no real value for yet. Saved encrypted credentials
 * die with the in-memory PGlite anyway, so a fresh ENCRYPTION_KEY per launch
 * is correct — Phase 2's on-disk PGlite will persist this from a per-user
 * config file alongside the data directory.
 */
function ensureRuntimeEnv() {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
    // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
    console.warn(
      "[NotebookLM Desktop] auto-generated ENCRYPTION_KEY for this session. " +
        "Saved credentials will not survive a restart while the stub uses " +
        "PGlite memory mode. Set ENCRYPTION_KEY in your environment to pin it.",
    );
  }
  if (!process.env.BETTER_AUTH_SECRET) {
    // Better Auth would auto-generate one but warn loudly. Pin it explicitly
    // so re-runs within the same Vite session keep the same session signing.
    process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("hex");
  }
}

/**
 * Phase 1 stub adapter for the desktop app.
 *
 * - Database: PGlite in `memory://` mode (no persistence across restarts).
 * - Storage: `createMemoryStorageProvider()` by default. Set
 *   `DESKTOP_STORAGE_DIR` env to swap in a real `createLocalStorageProvider`
 *   rooted at that path — useful for verifying the local-FS branch end to
 *   end before Phase 2's Tauri shell takes over.
 * - Auth: `createAuth({ db, baseURL })` so signups land in PGlite.
 *
 * Phase 2 swaps PGlite-memory for PGlite-on-disk and the storage default
 * for `createLocalStorageProvider(<user data dir>)`. The Hono app, the
 * tRPC routers, the streaming handlers — none of them change.
 */

let cachedAdapter: PlatformAdapter | null = null;

function buildStorage(): StorageProvider {
  const dir = process.env.DESKTOP_STORAGE_DIR;
  return dir ? createLocalStorageProvider(dir) : createMemoryStorageProvider();
}

export async function getStubAdapter(): Promise<PlatformAdapter> {
  if (cachedAdapter) return cachedAdapter;

  ensureRuntimeEnv();

  const pg = new PGlite("memory://", { extensions: { vector } });
  await pg.waitReady;
  const db = drizzle(pg, { schema });
  bindCoreRuntime({ db });

  await initSchema(db);

  const storage = buildStorage();

  const auth = createAuth({
    db,
    baseURL: "http://localhost:5173",
    trustedOrigins: ["http://localhost:5173"],
  });

  cachedAdapter = {
    db,
    auth,
    storage,
    env: {
      APP_URL: "http://localhost:5173",
      // BYOK env keys flow into the desktop the same way they would on the
      // web: read from process.env at adapter-build time so handlers see
      // them via `adapter.env.X`.
      DEEPGRAM_API_KEY: process.env.DEEPGRAM_API_KEY,
      EXA_API_KEY: process.env.EXA_API_KEY,
      TAVILY_API_KEY: process.env.TAVILY_API_KEY,
      SERPAPI_KEY: process.env.SERPAPI_KEY,
    },
  };
  return cachedAdapter;
}

/**
 * Create every table that packages/core/src/db/schema.ts defines, in
 * dependency order. PGlite supports pgvector when its `vector` extension
 * is loaded, so embedding columns Just Work.
 *
 * If the schema in core is changed, this function needs the matching DDL.
 * The plan is to replace this hand-rolled SQL with `drizzle-kit push`
 * against the PGlite db once the desktop persists across runs (Phase 2).
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

  // ── Notebook + sources + chunks ────────────────────────────────
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
      "created_at" timestamp DEFAULT now() NOT NULL
    )
  `);
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
  for (const dim of [768, 1024, 1536, 3072] as const) {
    const tableName = `chunk_embeddings_${dim}`;
    const idxName = `chunk_embeddings_${dim}_model_idx`;
    await db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS "${tableName}" (
        "chunk_id" uuid PRIMARY KEY REFERENCES "source_chunks"("id") ON DELETE CASCADE,
        "provider" text NOT NULL,
        "model" text NOT NULL,
        "embedding" vector(${dim}) NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      )
    `));
    await db.execute(
      sql.raw(`CREATE INDEX IF NOT EXISTS "${idxName}" ON "${tableName}" ("model")`),
    );
  }
}
