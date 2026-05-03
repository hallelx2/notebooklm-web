import { tool } from "ai";
import { z } from "zod";
import { parseLink } from "../../../../ingest/parse";

/**
 * AI SDK v6 tool wrapping `parseLink` — fetch a URL, run jsdom +
 * Readability with a regex fallback, return clean article text. Used by
 * research-style tasks where the model wants to read a specific page
 * after it already chose the URL via web search.
 *
 * Stateless. Same tool instance is shared across users.
 */
export const parseLinkTool = tool({
  description:
    "Fetch a URL and extract its readable text content (article body). Returns title and trimmed text (max 30k chars).",
  inputSchema: z.object({
    url: z.string().describe("Fully-qualified URL to fetch."),
  }),
  execute: async ({ url }) => {
    const parsed = await parseLink(url);
    return {
      title: parsed.title ?? url,
      text: parsed.text.slice(0, 30000),
    };
  },
});
