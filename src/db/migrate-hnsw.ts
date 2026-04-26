import { sql } from "drizzle-orm";
import { db } from "./index";

export async function createHNSWIndex() {
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
    ON source_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
}
