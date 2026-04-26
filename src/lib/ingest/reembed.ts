import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { notebooks, sourceChunks, sources } from "@/db/schema";
import {
  buildEmbeddingContext,
  embedTexts,
  persistChunkEmbeddings,
} from "./embed";

/**
 * Re-embed every chunk of a single source using the user's currently-active
 * embedding model. On success, atomically flip the source's
 * `source_chunks.embedding_*` pointers so retrieval starts using the new
 * vectors. Old embeddings in other dim tables stay in place for instant
 * rollback.
 */
export async function reembedSource(params: {
  userId: string;
  sourceId: string;
}): Promise<{
  chunkCount: number;
  newDim: number;
  newModel: string;
  newProvider: string;
}> {
  const { userId, sourceId } = params;

  // Verify the source belongs to this user (via the notebook FK).
  const [src] = await db
    .select({
      id: sources.id,
      notebookId: sources.notebookId,
      title: sources.title,
      ownerId: notebooks.userId,
    })
    .from(sources)
    .innerJoin(notebooks, eq(notebooks.id, sources.notebookId))
    .where(eq(sources.id, sourceId))
    .limit(1);
  if (!src) throw new Error("Source not found");
  if (src.ownerId !== userId) throw new Error("Forbidden");

  // Pull all chunks for this source in stable ordinal order.
  const chunks = await db
    .select({
      id: sourceChunks.id,
      content: sourceChunks.content,
      metadata: sourceChunks.metadata,
    })
    .from(sourceChunks)
    .where(eq(sourceChunks.sourceId, sourceId))
    .orderBy(asc(sourceChunks.ordinal));

  if (chunks.length === 0) {
    return {
      chunkCount: 0,
      newDim: 0,
      newModel: "",
      newProvider: "",
    };
  }

  // Build embedding contexts using the same shape as ingestion.
  const embeddingTexts = chunks.map((c) => {
    const meta = (c.metadata as { heading?: string } | null) ?? {};
    return buildEmbeddingContext(c.content, src.title, meta.heading);
  });

  const embedded = await embedTexts(userId, embeddingTexts);

  // Persist into the new dim's table.
  await persistChunkEmbeddings({
    chunkIds: chunks.map((c) => c.id),
    embedded,
  });

  // Atomically flip the per-chunk pointer columns AND the legacy column when
  // we're at 768 (so retrieval keeps working without the legacy fallback).
  // We do this in batches since pgvector inputs are large.
  const ids = chunks.map((c) => c.id);
  const BATCH = 100;
  for (let i = 0; i < ids.length; i += BATCH) {
    await db
      .update(sourceChunks)
      .set({
        embeddingDim: embedded.dim,
        embeddingModel: embedded.model,
        embeddingProvider: embedded.provider,
        // Clear legacy column unless the new dim is 768; otherwise it would
        // hold a stale vector at the wrong dim.
        ...(embedded.dim === 768 ? {} : { embedding: null }),
      })
      .where(inArray(sourceChunks.id, ids.slice(i, i + BATCH)));
  }

  return {
    chunkCount: chunks.length,
    newDim: embedded.dim,
    newModel: embedded.model,
    newProvider: embedded.provider,
  };
}

/**
 * Re-embed every source the user owns whose `embedding_model` doesn't match
 * their current setting. Yields one row per source so the caller can stream
 * progress via NDJSON to the UI.
 */
export async function* reembedAllUserSources(userId: string): AsyncGenerator<
  | {
      type: "source-start";
      sourceId: string;
      title: string;
      notebookId: string;
    }
  | { type: "source-done"; sourceId: string; chunkCount: number }
  | { type: "source-error"; sourceId: string; error: string }
  | { type: "summary"; total: number; succeeded: number; failed: number }
> {
  const userSources = await db
    .select({
      id: sources.id,
      notebookId: sources.notebookId,
      title: sources.title,
    })
    .from(sources)
    .innerJoin(notebooks, eq(notebooks.id, sources.notebookId))
    .where(and(eq(notebooks.userId, userId), eq(sources.status, "ready")))
    .orderBy(asc(sources.createdAt));

  let succeeded = 0;
  let failed = 0;

  for (const src of userSources) {
    yield {
      type: "source-start",
      sourceId: src.id,
      title: src.title,
      notebookId: src.notebookId,
    };
    try {
      const result = await reembedSource({ userId, sourceId: src.id });
      succeeded += 1;
      yield {
        type: "source-done",
        sourceId: src.id,
        chunkCount: result.chunkCount,
      };
    } catch (err) {
      failed += 1;
      yield {
        type: "source-error",
        sourceId: src.id,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  yield {
    type: "summary",
    total: userSources.length,
    succeeded,
    failed,
  };
}
