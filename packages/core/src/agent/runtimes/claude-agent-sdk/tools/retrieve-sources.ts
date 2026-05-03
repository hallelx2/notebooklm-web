import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { retrieveForQuery } from "../../../../retrieve";

/**
 * SDK-shaped tool wrapping `retrieveForQuery` (the 3-stage pipeline:
 * vector + keyword + LLM rerank). Same business logic as the AI SDK
 * runtime's tool of the same name; different registration shape so
 * the SDK's `mcpServers` option can pick it up.
 *
 * Bound per-call because retrieval is scoped to a specific user +
 * notebook. The runtime's `index.ts` calls `retrieveSourcesTool({...})`
 * to produce a tool definition the SDK wires into an MCP server.
 */
export function retrieveSourcesTool(opts: {
  userId: string;
  notebookId: string;
  sourceIds?: string[];
}) {
  return tool(
    "retrieve_sources",
    "Search the user's notebook for chunks relevant to a query. Returns up to N most relevant excerpts with source titles and chunk IDs (used for citations).",
    {
      query: z.string().describe("Natural language search query."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(20)
        .default(8)
        .describe("Max chunks to return."),
    },
    async ({ query, limit }) => {
      const chunks = await retrieveForQuery({
        userId: opts.userId,
        notebookId: opts.notebookId,
        query,
        topK: limit,
        sourceIds: opts.sourceIds,
      });
      const payload = chunks.map((c, i) => ({
        n: i + 1,
        chunkId: c.chunkId,
        sourceId: c.sourceId,
        title: c.sourceTitle,
        content: c.content.slice(0, 1500),
        similarity: c.similarity,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(payload) }],
      };
    },
  );
}
