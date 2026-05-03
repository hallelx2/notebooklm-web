import { tool } from "ai";
import { z } from "zod";
import { retrieveForQuery } from "../../../../retrieve";

/**
 * AI SDK v6 tool that lets the model search the user's notebook for
 * chunks relevant to a natural-language query. Wraps `retrieveForQuery`
 * (the 3-stage pipeline: vector + keyword + LLM rerank) so the
 * conversational chat task can pull additional sources mid-stream.
 *
 * Bound per-call because retrieval is scoped to a specific user +
 * notebook. The ai-sdk runtime calls `retrieveSourcesTool({ ... })` to
 * produce a configured tool the model can invoke.
 *
 * Currently defined but not wired into any task by default — the chat
 * task pre-retrieves sources into the system prompt to match the
 * pre-harness behaviour (see commit 2 plan). Available for future use
 * (e.g. multi-turn conversations where the model decides when to fetch
 * more context).
 */
export function retrieveSourcesTool(opts: {
  userId: string;
  notebookId: string;
  sourceIds?: string[];
}) {
  return tool({
    description:
      "Search the user's notebook for chunks relevant to a query. Returns up to N most relevant excerpts with their source titles and chunk IDs (used for [^N] citations).",
    inputSchema: z.object({
      query: z.string().describe("Natural language search query."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(8)
        .describe("Max chunks to return."),
    }),
    execute: async ({ query, limit }) => {
      const chunks = await retrieveForQuery({
        userId: opts.userId,
        notebookId: opts.notebookId,
        query,
        topK: limit,
        sourceIds: opts.sourceIds,
      });
      return chunks.map((c, i) => ({
        n: i + 1,
        chunkId: c.chunkId,
        sourceId: c.sourceId,
        title: c.sourceTitle,
        content: c.content.slice(0, 1500),
        similarity: c.similarity,
      }));
    },
  });
}
