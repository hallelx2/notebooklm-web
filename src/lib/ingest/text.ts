import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceChunks, sources } from "@/db/schema";
import { chunkText } from "./chunk";
import {
  buildEmbeddingContext,
  embedTexts,
  persistChunkEmbeddings,
} from "./embed";

/**
 * Ingest raw text content as a source (for notes, chat-to-source, deep
 * research reports). Chunks + embeds the text using the user's configured
 * embedding model and marks the source as "ready".
 */
export async function ingestText(params: {
  userId: string;
  sourceId: string;
  notebookId: string;
  text: string;
  sourceTitle?: string;
}) {
  try {
    await db
      .update(sources)
      .set({ status: "embedding", updatedAt: new Date() })
      .where(eq(sources.id, params.sourceId));

    const chunks = chunkText(params.text, params.sourceTitle);
    if (chunks.length > 0) {
      const embeddingTexts = chunks.map((c) =>
        buildEmbeddingContext(c.content, params.sourceTitle, c.heading),
      );
      const embedded = await embedTexts(params.userId, embeddingTexts);

      const rows = chunks.map((c, i) => ({
        sourceId: params.sourceId,
        notebookId: params.notebookId,
        ordinal: c.ordinal,
        content: c.content,
        tokenCount: c.tokenCount,
        metadata: {
          sourceTitle: params.sourceTitle ?? null,
          sourceUrl: null,
          heading: c.heading ?? null,
          position: `${c.ordinal + 1}/${chunks.length}`,
        },
        embedding: embedded.dim === 768 ? embedded.vectors[i] : null,
        embeddingDim: embedded.dim,
        embeddingModel: embedded.model,
        embeddingProvider: embedded.provider,
      }));

      const BATCH = 50;
      const insertedIds: string[] = [];
      for (let i = 0; i < rows.length; i += BATCH) {
        const inserted = await db
          .insert(sourceChunks)
          .values(rows.slice(i, i + BATCH))
          .returning({ id: sourceChunks.id });
        for (const r of inserted) insertedIds.push(r.id);
      }

      await persistChunkEmbeddings({ chunkIds: insertedIds, embedded });
    }

    await db
      .update(sources)
      .set({
        status: "ready",
        content: params.text.slice(0, 20000),
        updatedAt: new Date(),
      })
      .where(eq(sources.id, params.sourceId));
  } catch (err) {
    await db
      .update(sources)
      .set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date(),
      })
      .where(eq(sources.id, params.sourceId));
    throw err;
  }
}
