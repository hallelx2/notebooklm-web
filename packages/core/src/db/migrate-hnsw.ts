import { sql } from "drizzle-orm";
import type { Database } from "./index";

export async function createHNSWIndex(db: Database) {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
    ON source_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
}
