import { isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { sourceChunks } from "./schema";

/**
 * One-shot migration that copies every legacy 768-dim embedding sitting on
 * `source_chunks.embedding` into the new `chunk_embeddings_768` table and
 * tags the parent row with the active model/dim.
 *
 * Idempotent: skips chunks that already have a row in `chunk_embeddings_768`
 * or that already have `embedding_dim` set on `source_chunks`.
 *
 * Run via `POST /api/admin/migrate?step=backfill` after `db:push`.
 */
export async function backfillLegacyEmbeddings(): Promise<{
  copied: number;
  skipped: number;
}> {
  // We do the copy in a single SQL statement -- much faster than fetching
  // batches into Node and re-inserting. The `ON CONFLICT DO NOTHING` makes
  // re-runs safe.
  const insertResult = await db.execute(sql`
    INSERT INTO chunk_embeddings_768 (chunk_id, provider, model, embedding, created_at)
    SELECT
      sc.id,
      'google'             AS provider,
      'gemini-embedding-001' AS model,
      sc.embedding,
      sc.created_at
    FROM source_chunks sc
    WHERE sc.embedding IS NOT NULL
      AND sc.embedding_dim IS NULL
    ON CONFLICT (chunk_id) DO NOTHING
  `);

  // Tag the source_chunks rows with the dim/model pointer so retrieval can
  // route to chunk_embeddings_768. We deliberately do not touch chunks where
  // embedding_dim is already set (a re-embed has happened).
  const updateResult = await db.execute(sql`
    UPDATE source_chunks
    SET embedding_dim      = 768,
        embedding_model    = 'gemini-embedding-001',
        embedding_provider = 'google'
    WHERE embedding IS NOT NULL
      AND embedding_dim IS NULL
  `);

  // Drizzle's pg driver returns rowCount on the result; fall back to length.
  const copied =
    (insertResult as { rowCount?: number; rows?: unknown[] }).rowCount ??
    (insertResult as { rows?: unknown[] }).rows?.length ??
    0;

  const updated =
    (updateResult as { rowCount?: number; rows?: unknown[] }).rowCount ??
    (updateResult as { rows?: unknown[] }).rows?.length ??
    0;

  // Count rows still pending (legacy embedding present but no dim pointer).
  const [{ pending }] = (await db
    .select({
      pending: sql<number>`COUNT(*)::int`,
    })
    .from(sourceChunks)
    .where(
      sql`${sourceChunks.embedding} IS NOT NULL AND ${sourceChunks.embeddingDim} IS NULL`,
    )) as Array<{ pending: number }>;

  return {
    copied: Number(copied) || Number(updated) || 0,
    skipped: Number(pending) || 0,
  };
}

// Mark imports as used (unused-import lint shield -- these may not be
// referenced if drizzle's `.execute()` typing changes).
void isNull;
void isNotNull;
