import type { RetrievedChunk } from "../../../../retrieve";

/**
 * Query-expansion prompt — used when the rerank task is invoked with an
 * empty `candidates` array. The model returns 1-4 alternative phrasings
 * of the user's question; the first should be the original query.
 *
 * Verbatim port of the prompt in `expandQuery` (`packages/core/src/retrieve.ts`).
 */
export function expandQueryPrompt(query: string): string {
  return `Generate 2-3 alternative search queries that capture different aspects of this question. Include the original query first. Be concise.

Original: ${query}`;
}

/**
 * Rerank prompt — used when the rerank task has non-empty candidates.
 * The model rates each chunk on a 0-10 relevance scale; the runtime
 * sorts by score and slices to topK.
 *
 * Verbatim port of the prompt in `rerankChunks` (`packages/core/src/retrieve.ts`).
 */
export function rerankPrompt(
  query: string,
  candidates: RetrievedChunk[],
): string {
  return `Rate each text chunk's relevance to the question on a 0-10 scale.
Question: "${query}"

Chunks:
${candidates.map((c, i) => `[${i}] (${c.sourceTitle}): ${c.content.slice(0, 300)}`).join("\n\n")}

Return relevance scores for ALL chunks. 10 = directly answers the question, 0 = completely irrelevant.`;
}
