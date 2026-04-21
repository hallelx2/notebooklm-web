import "server-only";
import { and, eq, sql } from "drizzle-orm";
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

export async function retrieveForQuery(params: {
  notebookId: string;
  query: string;
  topK?: number;
  sourceIds?: string[];
}): Promise<RetrievedChunk[]> {
  const queryVec = await embedQuery(params.query);
  const topK = params.topK ?? 8;
  const distance = sql<number>`${sourceChunks.embedding} <=> ${JSON.stringify(
    queryVec,
  )}::vector`;
  const where =
    params.sourceIds && params.sourceIds.length > 0
      ? and(
          eq(sourceChunks.notebookId, params.notebookId),
          sql`${sourceChunks.sourceId} = ANY(${params.sourceIds})`,
        )
      : eq(sourceChunks.notebookId, params.notebookId);

  const rows = await db
    .select({
      chunkId: sourceChunks.id,
      sourceId: sourceChunks.sourceId,
      content: sourceChunks.content,
      similarity: sql<number>`1 - (${distance})`,
      sourceTitle: sources.title,
    })
    .from(sourceChunks)
    .leftJoin(sources, eq(sources.id, sourceChunks.sourceId))
    .where(where)
    .orderBy(distance)
    .limit(topK);

  return rows.map((r) => ({
    chunkId: r.chunkId,
    sourceId: r.sourceId,
    sourceTitle: r.sourceTitle ?? "Source",
    content: r.content,
    similarity: r.similarity,
  }));
}
