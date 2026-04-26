import "server-only";
import { generateObject } from "ai";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sourceChunks, sources } from "@/db/schema";
import { getChatModel } from "@/lib/ai/factory";
import { embeddingTableForDim, embedQueryFor } from "./ingest/embed";

export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  similarity: number;
};

/* ---------- Query Expansion ---------- */

async function expandQuery(userId: string, query: string): Promise<string[]> {
  try {
    const model = await getChatModel(userId);
    const { object } = await generateObject({
      model,
      schema: z.object({
        queries: z.array(z.string()).min(1).max(4),
      }),
      prompt: `Generate 2-3 alternative search queries that capture different aspects of this question. Include the original query first. Be concise.

Original: ${query}`,
    });
    return object.queries;
  } catch {
    return [query]; // fallback to original
  }
}

/* ---------- LLM Reranking ---------- */

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

  try {
    const model = await getChatModel(userId);
    const { object } = await generateObject({
      model,
      schema: z.object({
        ranked: z.array(
          z.object({
            index: z.number(),
            relevance: z.number().min(0).max(10),
          }),
        ),
      }),
      prompt: `Rate each text chunk's relevance to the question on a 0-10 scale.
Question: "${query}"

Chunks:
${chunks.map((c, i) => `[${i}] (${c.sourceTitle}): ${c.content.slice(0, 300)}`).join("\n\n")}

Return relevance scores for ALL chunks. 10 = directly answers the question, 0 = completely irrelevant.`,
    });

    const scoreMap = new Map(object.ranked.map((r) => [r.index, r.relevance]));
    const sorted = [...chunks]
      .map((c, i) => ({ ...c, llmScore: scoreMap.get(i) ?? 5 }))
      .sort((a, b) => b.llmScore - a.llmScore);

    return sorted.slice(0, topK);
  } catch {
    return chunks.slice(0, topK);
  }
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
