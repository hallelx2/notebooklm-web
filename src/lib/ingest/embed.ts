import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chunkEmbeddings768,
  chunkEmbeddings1024,
  chunkEmbeddings1536,
  chunkEmbeddings3072,
} from "@/db/schema";
import { googleEmbedAdapter } from "@/lib/ai/embed/google";
import { getEmbedFn } from "@/lib/ai/factory";
import { isSupportedDim, type SupportedEmbedDim } from "@/lib/ai/providers";

/* ------------------------------------------------------------------ */
/*  Per-dimension table routing                                         */
/* ------------------------------------------------------------------ */

/**
 * Map a supported embedding dimension to its drizzle pgTable. Throws if
 * the dim isn't one we have a storage table for.
 */
export function embeddingTableForDim(dim: SupportedEmbedDim) {
  switch (dim) {
    case 768:
      return chunkEmbeddings768;
    case 1024:
      return chunkEmbeddings1024;
    case 1536:
      return chunkEmbeddings1536;
    case 3072:
      return chunkEmbeddings3072;
  }
}

/* ------------------------------------------------------------------ */
/*  Public API used by the ingestion pipeline                           */
/* ------------------------------------------------------------------ */

export interface EmbeddedBatch {
  vectors: number[][];
  provider: string;
  model: string;
  dim: SupportedEmbedDim;
}

/**
 * Embed `texts` using the user's currently-configured embedding provider
 * and model. Throws {@link import("@/lib/ai/factory").NoAiConfigError}
 * when the user hasn't picked one yet.
 */
export async function embedTexts(
  userId: string,
  texts: string[],
): Promise<EmbeddedBatch> {
  if (texts.length === 0) {
    return { vectors: [], provider: "", model: "", dim: 768 };
  }
  const handle = await getEmbedFn(userId);
  if (!isSupportedDim(handle.dim)) {
    throw new Error(
      `Embedding dim ${handle.dim} is not supported. Pick a model that produces a vector of size ${[768, 1024, 1536, 3072].join(", ")}.`,
    );
  }
  const vectors = await handle.embed(texts);
  return {
    vectors,
    provider: handle.provider,
    model: handle.model,
    dim: handle.dim as SupportedEmbedDim,
  };
}

/**
 * Embed a single query string. Returns the vector plus the model/dim/provider
 * so callers know which `chunk_embeddings_<dim>` table to query against.
 */
export async function embedQueryFor(userId: string, text: string) {
  const batch = await embedTexts(userId, [text]);
  return {
    vector: batch.vectors[0],
    provider: batch.provider,
    model: batch.model,
    dim: batch.dim,
  };
}

/**
 * Persist a batch of embeddings into the right `chunk_embeddings_<dim>`
 * table. Uses ON CONFLICT (chunk_id) DO UPDATE so re-embedding the same
 * chunk overwrites the previous vector cleanly.
 */
export async function persistChunkEmbeddings(opts: {
  chunkIds: string[];
  embedded: EmbeddedBatch;
}): Promise<void> {
  const { chunkIds, embedded } = opts;
  if (chunkIds.length !== embedded.vectors.length) {
    throw new Error(
      `persistChunkEmbeddings: chunkIds (${chunkIds.length}) and vectors (${embedded.vectors.length}) length mismatch`,
    );
  }
  if (chunkIds.length === 0) return;

  const table = embeddingTableForDim(embedded.dim);
  const rows = chunkIds.map((id, i) => ({
    chunkId: id,
    provider: embedded.provider,
    model: embedded.model,
    embedding: embedded.vectors[i],
  }));

  const BATCH = 50;
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(table)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: table.chunkId,
        set: {
          provider: sql`excluded.provider`,
          model: sql`excluded.model`,
          embedding: sql`excluded.embedding`,
        },
      });
  }
}

/* ------------------------------------------------------------------ */
/*  Embedding context helper                                            */
/* ------------------------------------------------------------------ */

/**
 * Build a contextual string for embedding -- prepends source title and
 * section heading so the embedding captures WHAT the chunk is about, not
 * just the raw text.
 */
export function buildEmbeddingContext(
  chunkContent: string,
  sourceTitle?: string,
  sectionHeading?: string,
): string {
  const parts: string[] = [];
  if (sourceTitle) parts.push(`Source: ${sourceTitle}`);
  if (sectionHeading) parts.push(`Section: ${sectionHeading}`);
  parts.push(chunkContent);
  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/*  Legacy shim (used by the maintainer's existing deployment until     */
/*  every user has been onboarded). Removed in Phase 5 cleanup.         */
/* ------------------------------------------------------------------ */

export const EMBED_DIMS = 768;
const LEGACY_MODEL = "gemini-embedding-001";

/**
 * @deprecated Use {@link embedTexts}. Kept so legacy code paths that don't
 * have a `userId` keep working until the cutover finishes. Falls back to
 * the maintainer's `GOOGLE_GENERATIVE_AI_API_KEY` env var.
 */
export async function embedChunks(texts: string[]): Promise<number[][]> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
  return googleEmbedAdapter.embed(texts, {
    apiKey,
    model: LEGACY_MODEL,
    dim: EMBED_DIMS,
  });
}

/** @deprecated Use {@link embedQueryFor}. */
export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedChunks([text]);
  return v;
}
