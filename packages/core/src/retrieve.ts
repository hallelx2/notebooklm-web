import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { loadRuntimesForTask, runAgent } from "./agent";
import { sourceChunks, sources } from "./db/schema";
import { embeddingTableForDim, embedQueryFor } from "./ingest/embed";
import { coreDb } from "./runtime";

export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  similarity: number;
};

/* ---------- Query Expansion ---------- */
/* Routes through `runAgent({ kind: "rerank" }, ...)` with empty
 * candidates — see `packages/core/src/agent/runtimes/ai-sdk/index.ts`
 * `runExpand` for the LLM call. The harness's silent error fallback
 * matches the pre-harness `try/catch -> [query]` behaviour. */

async function expandQuery(userId: string, query: string): Promise<string[]> {
  const runtimes = await loadRuntimesForTask(userId, "rerank");
  for await (const ev of runAgent(
    { kind: "rerank", userId, query, candidates: [], topK: 0 },
    runtimes,
    { userId },
  )) {
    if (ev.type === "done") {
      const obj = ev.finalObject as { queries?: string[] } | undefined;
      return obj?.queries ?? [query];
    }
  }
  return [query];
}

/* ---------- LLM Reranking ---------- */
/* Same `kind: "rerank"` task with non-empty candidates; the runtime
 * adapter switches to score mode (`runScore`) and yields a sorted
 * topK slice. The pre-harness short-circuit "if chunks.length <= topK
 * skip the LLM" lives in the adapter now too. */

async function rerankChunks(
  userId: string,
  query: string,
  chunks: {
    chunkId: string;
    sourceId: string;
    sourceTitle: string;
    content: string;
    similarity: number;
  }[],
  topK: number,
): Promise<typeof chunks> {
  if (chunks.length <= topK) return chunks;

  const runtimes = await loadRuntimesForTask(userId, "rerank");
  for await (const ev of runAgent(
    { kind: "rerank", userId, query, candidates: chunks, topK },
    runtimes,
    { userId },
  )) {
    if (ev.type === "done") {
      const obj = ev.finalObject as { sorted?: typeof chunks } | undefined;
      return obj?.sorted ?? chunks.slice(0, topK);
    }
  }
  return chunks.slice(0, topK);
}

/* ---------- Hybrid Retrieval ---------- */

export async function retrieveForQuery(params: {
  userId: string;
  notebookId: string;
  query: string;
  topK?: number;
  sourceIds?: string[];
}): Promise<RetrievedChunk[]> {
  const topK = params.topK ?? 12;
  const db = coreDb();

  // Step 1: Expand query (using the user's chat model).
  const expandedQueries = await expandQuery(params.userId, params.query);

  // Step 2: Embed the primary query using the user's CURRENT embedding model.
  // The dim/model tells us which chunk_embeddings_<dim> table to query.
  const embedded = await embedQueryFor(params.userId, expandedQueries[0]);
  const queryVecJson = JSON.stringify(embedded.vector);
  const embTable = embeddingTableForDim(embedded.dim);

  // Step 3a: Vector search through the per-dim embedding table, restricted
  // to chunks embedded with the user's currently-active model.
  const baseWhere =
    params.sourceIds && params.sourceIds.length > 0
      ? and(
          eq(sourceChunks.notebookId, params.notebookId),
          sql`${sourceChunks.sourceId} = ANY(${params.sourceIds})`,
        )
      : eq(sourceChunks.notebookId, params.notebookId);

  const distance = sql<number>`${embTable.embedding} <=> ${queryVecJson}::vector`;

  const newResults = await db
    .select({
      chunkId: sourceChunks.id,
      sourceId: sourceChunks.sourceId,
      content: sourceChunks.content,
      metadata: sourceChunks.metadata,
      similarity: sql<number>`1 - (${distance})`,
      sourceTitle: sources.title,
    })
    .from(embTable)
    .innerJoin(sourceChunks, eq(sourceChunks.id, embTable.chunkId))
    .leftJoin(sources, eq(sources.id, sourceChunks.sourceId))
    .where(and(baseWhere, eq(embTable.model, embedded.model)))
    .orderBy(distance)
    .limit(topK * 2);

  // Step 3b: Legacy fallback (dual-write window). For chunks that have not
  // yet been migrated -- `embedding_dim IS NULL` and `embedding` populated --
  // query the legacy 768-dim column. Only safe when the user's current model
  // is also 768-dim, since otherwise the vectors live in different spaces.
  let legacyResults: typeof newResults = [];
  if (embedded.dim === 768) {
    const legacyDistance = sql<number>`${sourceChunks.embedding} <=> ${queryVecJson}::vector`;
    legacyResults = await db
      .select({
        chunkId: sourceChunks.id,
        sourceId: sourceChunks.sourceId,
        content: sourceChunks.content,
        metadata: sourceChunks.metadata,
        similarity: sql<number>`1 - (${legacyDistance})`,
        sourceTitle: sources.title,
      })
      .from(sourceChunks)
      .leftJoin(sources, eq(sources.id, sourceChunks.sourceId))
      .where(
        and(
          baseWhere,
          isNotNull(sourceChunks.embedding),
          isNull(sourceChunks.embeddingDim),
        ),
      )
      .orderBy(legacyDistance)
      .limit(topK * 2);
  }

  // Step 4: Keyword boost -- additional results matching keywords.
  const keywords = params.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  let keywordResults: typeof newResults = [];
  if (keywords.length > 0) {
    const keywordPattern = keywords.slice(0, 5).join("|");
    try {
      keywordResults = await db
        .select({
          chunkId: sourceChunks.id,
          sourceId: sourceChunks.sourceId,
          content: sourceChunks.content,
          metadata: sourceChunks.metadata,
          similarity: sql<number>`0.5`,
          sourceTitle: sources.title,
        })
        .from(sourceChunks)
        .leftJoin(sources, eq(sources.id, sourceChunks.sourceId))
        .where(
          and(baseWhere, sql`${sourceChunks.content} ~* ${keywordPattern}`),
        )
        .limit(topK);
    } catch {
      // keyword search failed, that's ok
    }
  }

  // Step 5: Merge and deduplicate (vector wins over keyword on collision).
  const seen = new Set<string>();
  const merged: (typeof newResults)[number][] = [];
  for (const r of [...newResults, ...legacyResults, ...keywordResults]) {
    if (!seen.has(r.chunkId)) {
      seen.add(r.chunkId);
      merged.push(r);
    }
  }

  // Step 6: Filter by minimum similarity threshold.
  const MIN_SIMILARITY = 0.3;
  const filtered = merged.filter((r) => r.similarity >= MIN_SIMILARITY);

  const candidates = filtered.slice(0, topK * 2).map((r) => ({
    chunkId: r.chunkId,
    sourceId: r.sourceId,
    sourceTitle: r.sourceTitle ?? "Source",
    content: r.content,
    similarity: r.similarity,
  }));

  // Step 7: LLM reranking.
  const reranked = await rerankChunks(
    params.userId,
    params.query,
    candidates,
    topK,
  );

  return reranked.map((r) => ({
    chunkId: r.chunkId,
    sourceId: r.sourceId,
    sourceTitle: r.sourceTitle,
    content: r.content,
    similarity: r.similarity,
  }));
}
