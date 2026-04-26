import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceChunks, sources } from "@/db/schema";
import { maybeAutoTitleNotebook } from "./autotitle";
import { chunkText } from "./chunk";
import {
  buildEmbeddingContext,
  embedTexts,
  persistChunkEmbeddings,
} from "./embed";
import { parseByMime, parseLink } from "./parse";

async function setStatus(
  sourceId: string,
  status: string,
  error?: string | null,
) {
  await db
    .update(sources)
    .set({ status, error: error ?? null, updatedAt: new Date() })
    .where(eq(sources.id, sourceId));
}

/**
 * Chunk + embed + insert. Embeddings are written to the per-dim table
 * matching the user's currently-configured embedding model. The legacy
 * `source_chunks.embedding` column is also dual-written when the dim is
 * 768, so old retrieval paths continue to work during the cutover.
 */
async function insertChunks(params: {
  userId: string;
  sourceId: string;
  notebookId: string;
  text: string;
  sourceTitle?: string;
  sourceUrl?: string;
}) {
  const chunks = chunkText(params.text, params.sourceTitle);
  if (chunks.length === 0) return 0;

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
      sourceUrl: params.sourceUrl ?? null,
      heading: c.heading ?? null,
      position: `${c.ordinal + 1}/${chunks.length}`,
    },
    // Dual-write the legacy column only when dim matches the legacy
    // pgvector(768) shape. Other dims would fail the column constraint.
    embedding: embedded.dim === 768 ? embedded.vectors[i] : null,
    embeddingDim: embedded.dim,
    embeddingModel: embedded.model,
    embeddingProvider: embedded.provider,
  }));

  // Insert in batches, capturing the new chunk IDs so we can index their
  // embeddings into the per-dim sibling table.
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
  return rows.length;
}

export async function ingestFile(params: {
  userId: string;
  sourceId: string;
  notebookId: string;
  buffer: Buffer;
  mimeType?: string | null;
  filename?: string;
}) {
  try {
    await setStatus(params.sourceId, "parsing");
    const parsed = await parseByMime(
      params.buffer,
      params.mimeType,
      params.filename,
    );
    await setStatus(params.sourceId, "embedding");
    await insertChunks({
      userId: params.userId,
      sourceId: params.sourceId,
      notebookId: params.notebookId,
      text: parsed.text,
      sourceTitle: params.filename,
    });
    await db
      .update(sources)
      .set({
        status: "ready",
        content: parsed.text.slice(0, 20000),
        updatedAt: new Date(),
      })
      .where(eq(sources.id, params.sourceId));
    maybeAutoTitleNotebook(params.userId, params.notebookId, parsed.text).catch(
      () => {},
    );
  } catch (err) {
    await setStatus(
      params.sourceId,
      "error",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}

export async function ingestLink(params: {
  userId: string;
  sourceId: string;
  notebookId: string;
  url: string;
}) {
  try {
    await setStatus(params.sourceId, "parsing");
    const parsed = await parseLink(params.url);
    await setStatus(params.sourceId, "embedding");
    await insertChunks({
      userId: params.userId,
      sourceId: params.sourceId,
      notebookId: params.notebookId,
      text: parsed.text,
      sourceTitle: parsed.title ?? params.url,
      sourceUrl: params.url,
    });
    await db
      .update(sources)
      .set({
        status: "ready",
        title: parsed.title ?? params.url,
        content: parsed.text.slice(0, 20000),
        updatedAt: new Date(),
      })
      .where(eq(sources.id, params.sourceId));
    maybeAutoTitleNotebook(params.userId, params.notebookId, parsed.text).catch(
      () => {},
    );
  } catch (err) {
    await setStatus(
      params.sourceId,
      "error",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}
