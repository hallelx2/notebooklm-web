import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { webSearch } from "../../../../search";

/**
 * SDK-shaped tool wrapping the unified `webSearch` helper. Bound
 * per-call (factory) so the wrapped `webSearch` can resolve per-user
 * credentials saved in Settings → Web Search before falling back to
 * env vars.
 */
export function webSearchTool(opts: { userId?: string } = {}) {
  return tool(
    "web_search",
    "Search the public web for information. Returns top results with titles, URLs, and snippets. Useful when the user's notebook does not contain enough context.",
    {
      query: z.string().describe("Search query."),
      mode: z.enum(["fast", "deep"]).default("fast"),
      limit: z.number().int().min(1).max(10).default(6),
    },
    async ({ query, mode, limit }) => {
      const results = await webSearch(query, mode, limit, {
        userId: opts.userId,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(results) }],
      };
    },
  );
}
