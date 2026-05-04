import { tool } from "ai";
import { z } from "zod";
import { webSearch } from "../../../../search";

/**
 * AI SDK v6 tool wrapping the unified `webSearch` helper. The mode
 * parameter mirrors the deep-research handler's "fast" vs "deep"
 * toggle — deep returns more results per query, with full-text
 * snippets where the provider supports it.
 *
 * Bound per-call (factory) so the wrapped `webSearch` can resolve
 * **per-user credentials** (Settings → Web Search) before falling
 * back to env vars. Same shape as `retrieveSourcesTool`.
 */
export function webSearchTool(opts: { userId?: string } = {}) {
  return tool({
    description:
      "Search the public web for information. Returns top results with titles, URLs, and snippets. Useful when the user's notebook does not contain enough context.",
    inputSchema: z.object({
      query: z.string().describe("Search query."),
      mode: z.enum(["fast", "deep"]).default("fast"),
      limit: z.number().int().min(1).max(10).default(6),
    }),
    execute: async ({ query, mode, limit }) => {
      return webSearch(query, mode, limit, { userId: opts.userId });
    },
  });
}
