import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { webSearch } from "../../../../search";

/**
 * SDK-shaped tool wrapping the unified `webSearch` helper (Exa with
 * Tavily fallback). Stateless — same instance is reusable across
 * users, so the runtime exports it as a top-level constant.
 */
export const webSearchTool = tool(
  "web_search",
  "Search the public web for information. Returns top results with titles, URLs, and snippets. Useful when the user's notebook does not contain enough context.",
  {
    query: z.string().describe("Search query."),
    mode: z.enum(["fast", "deep"]).default("fast"),
    limit: z.number().int().min(1).max(10).default(6),
  },
  async ({ query, mode, limit }) => {
    const results = await webSearch(query, mode, limit);
    return {
      content: [{ type: "text", text: JSON.stringify(results) }],
    };
  },
);
