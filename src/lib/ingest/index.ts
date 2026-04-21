import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sourceChunks, sources } from "@/db/schema";
import { maybeAutoTitleNotebook } from "./autotitle";
import { chunkText } from "./chunk";
import { embedChunks } from "./embed";
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

async function insertChunks(params: {
  sourceId: string;
  notebookId: string;
  text: string;
}) {
  const chunks = chunkText(params.text);
  if (chunks.length === 0) return 0;
  const embeddings = await embedChunks(chunks.map((c) => c.content));
  const rows = chunks.map((c, i) => ({
    sourceId: params.sourceId,
    notebookId: params.notebookId,
    ordinal: c.ordinal,
    content: c.content,
    tokenCount: c.tokenCount,
    embedding: embeddings[i],
  }));
  // chunked insert to avoid oversized statements
  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db.insert(sourceChunks).values(rows.slice(i, i + BATCH));
  }
  return rows.length;
}

export async function ingestFile(params: {
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
      sourceId: params.sourceId,
      notebookId: params.notebookId,
      text: parsed.text,
    });
    await db
      .update(sources)
      .set({
        status: "ready",
        content: parsed.text.slice(0, 20000),
        updatedAt: new Date(),
      })
      .where(eq(sources.id, params.sourceId));
    maybeAutoTitleNotebook(params.notebookId, parsed.text).catch(() => {});
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
  sourceId: string;
  notebookId: string;
  url: string;
}) {
  try {
    await setStatus(params.sourceId, "parsing");
    const parsed = await parseLink(params.url);
    await setStatus(params.sourceId, "embedding");
    await insertChunks({
      sourceId: params.sourceId,
      notebookId: params.notebookId,
      text: parsed.text,
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
    maybeAutoTitleNotebook(params.notebookId, parsed.text).catch(() => {});
  } catch (err) {
    await setStatus(
      params.sourceId,
      "error",
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }
}
