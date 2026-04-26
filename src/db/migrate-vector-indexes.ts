import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Create HNSW cosine indexes for the per-dimension embedding tables.
 *
 * `db:push` creates the tables but does not always create HNSW indexes
 * reliably across drizzle-kit versions, so we apply them via raw SQL the
 * same way the legacy `migrate-hnsw.ts` did. Idempotent (`IF NOT EXISTS`).
 *
 * Call this after any new dimension table is added in the schema, or once
 * per fresh deploy.
 */
export async function createVectorIndexes() {
  // chunk_embeddings_768
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chunk_embeddings_768_hnsw_idx
    ON chunk_embeddings_768
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);

  // chunk_embeddings_1024
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chunk_embeddings_1024_hnsw_idx
    ON chunk_embeddings_1024
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);

  // chunk_embeddings_1536
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chunk_embeddings_1536_hnsw_idx
    ON chunk_embeddings_1536
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);

  // pgvector currently caps HNSW at 2000 dims, so 3072-dim tables get a
  // straight btree on (chunk_id, model) instead of a vector index. Sequential
  // scan is still fast enough for the small number of 3072-dim users.
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chunk_embeddings_3072_chunk_idx
    ON chunk_embeddings_3072 (chunk_id, model)
  `);
}
