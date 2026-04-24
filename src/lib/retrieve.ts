import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { google } from "@ai-sdk/google";
import { generateObject } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { sourceChunks, sources } from "@/db/schema";
import { embedQuery } from "./ingest/embed";

export type RetrievedChunk = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
  similarity: number;
};

/* ---------- Query Expansion ---------- */

async function expandQuery(query: string): Promise<string[]> {
  try {
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
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
    const { object } = await generateObject({
      model: google("gemini-2.5-flash"),
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

    // Sort by relevance score
    const scoreMap = new Map(object.ranked.map((r) => [r.index, r.relevance]));
    const sorted = [...chunks]
      .map((c, i) => ({ ...c, llmScore: scoreMap.get(i) ?? 5 }))
      .sort((a, b) => b.llmScore - a.llmScore);

    return sorted.slice(0, topK);
  } catch {
    // Fallback to vector similarity ordering
    return chunks.slice(0, topK);
  }
}

/* ---------- Hybrid Retrieval ---------- */

export async function retrieveForQuery(params: {
  notebookId: string;
  query: string;
  topK?: number;
  sourceIds?: string[];
}): Promise<RetrievedChunk[]> {
  const topK = params.topK ?? 12; // fetch more, then rerank

  // Step 1: Expand query
  const expandedQueries = await expandQuery(params.query);

  // Step 2: Vector search with primary query embedding
  const queryVecs = await Promise.all(
    expandedQueries.map((q) => embedQuery(q)),
  );

  // Use the primary query vector for the main search
  const primaryVec = queryVecs[0];
  const distance = sql<number>`${sourceChunks.embedding} <=> ${JSON.stringify(primaryVec)}::vector`;

  const baseWhere =
    params.sourceIds && params.sourceIds.length > 0
      ? and(
          eq(sourceChunks.notebookId, params.notebookId),
          sql`${sourceChunks.sourceId} = ANY(${params.sourceIds})`,
        )
      : eq(sourceChunks.notebookId, params.notebookId);

  // Vector search
  const vectorResults = await db
    .select({
      chunkId: sourceChunks.id,
      sourceId: sourceChunks.sourceId,
      content: sourceChunks.content,
      metadata: sourceChunks.metadata,
      similarity: sql<number>`1 - (${distance})`,
      sourceTitle: sources.title,
    })
    .from(sourceChunks)
    .leftJoin(sources, eq(sources.id, sourceChunks.sourceId))
    .where(baseWhere)
    .orderBy(distance)
    .limit(topK * 2); // fetch extra for deduplication

  // Step 3: Keyword boost -- search for additional results matching keywords
  const keywords = params.query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  let keywordResults: typeof vectorResults = [];
  if (keywords.length > 0) {
    const keywordPattern = keywords.slice(0, 5).join("|");
    try {
      keywordResults = await db
        .select({
          chunkId: sourceChunks.id,
          sourceId: sourceChunks.sourceId,
          content: sourceChunks.content,
          metadata: sourceChunks.metadata,
          similarity: sql<number>`0.5`, // baseline score for keyword matches
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

  // Step 4: Merge and deduplicate
  const seen = new Set<string>();
  const merged: (typeof vectorResults)[number][] = [];
  for (const r of [...vectorResults, ...keywordResults]) {
    if (!seen.has(r.chunkId)) {
      seen.add(r.chunkId);
      merged.push(r);
    }
  }

  // Step 5: Filter by minimum similarity threshold
  const MIN_SIMILARITY = 0.3;
  const filtered = merged.filter((r) => r.similarity >= MIN_SIMILARITY);

  // Take top candidates for reranking
  const candidates = filtered.slice(0, topK * 2).map((r) => ({
    chunkId: r.chunkId,
    sourceId: r.sourceId,
    sourceTitle: r.sourceTitle ?? "Source",
    content: r.content,
    similarity: r.similarity,
  }));

  // Step 6: LLM reranking
  const reranked = await rerankChunks(params.query, candidates, topK);

  return reranked.map((r) => ({
    chunkId: r.chunkId,
    sourceId: r.sourceId,
    sourceTitle: r.sourceTitle,
    content: r.content,
    similarity: r.similarity,
  }));
}
