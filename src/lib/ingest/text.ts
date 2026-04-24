import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceChunks, sources } from "@/db/schema";
import { chunkText } from "./chunk";
import { embedChunks } from "./embed";

/**
 * Ingest raw text content as a source (for notes, chat-to-source, deep research reports).
 * Chunks + embeds the text and marks the source as "ready".
 */
export async function ingestText(params: {
  sourceId: string;
  notebookId: string;
  text: string;
}) {
  try {
    await db
      .update(sources)
      .set({ status: "embedding", updatedAt: new Date() })
      .where(eq(sources.id, params.sourceId));

    const chunks = chunkText(params.text);
    if (chunks.length > 0) {
      const embeddings = await embedChunks(chunks.map((c) => c.content));
      const rows = chunks.map((c, i) => ({
        sourceId: params.sourceId,
        notebookId: params.notebookId,
        ordinal: c.ordinal,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: embeddings[i],
      }));
      const BATCH = 50;
      for (let i = 0; i < rows.length; i += BATCH) {
        await db.insert(sourceChunks).values(rows.slice(i, i + BATCH));
      }
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
