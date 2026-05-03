import { tool } from "ai";
import { z } from "zod";
import { webSearch } from "../../../../search";

/**
 * AI SDK v6 tool wrapping the unified `webSearch` helper (Exa with
 * Tavily fallback). The mode parameter mirrors the deep-research
 * handler's "fast" vs "deep" toggle — deep returns more results per
 * query, with full-text snippets where the provider supports it.
 *
 * Stateless: same tool instance is reusable across users. Bound at
 * import time.
 */
export const webSearchTool = tool({
  description:
    "Search the public web for information. Returns top results with titles, URLs, and snippets. Useful when the user's notebook does not contain enough context.",
  inputSchema: z.object({
    query: z.string().describe("Search query."),
    mode: z.enum(["fast", "deep"]).default("fast"),
    limit: z.number().int().min(1).max(10).default(6),
  }),
  execute: async ({ query, mode, limit }) => {
    return webSearch(query, mode, limit);
  },
});
