import { tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { parseLink } from "../../../../ingest/parse";

/**
 * SDK-shaped tool wrapping `parseLink` — fetch a URL, run jsdom +
 * Readability with a regex fallback, return clean article text.
 * Stateless — same instance across users.
 */
export const parseLinkTool = tool(
  "parse_link",
  "Fetch a URL and extract its readable text content (article body). Returns title and trimmed text (max 30k chars).",
  {
    url: z.string().describe("Fully-qualified URL to fetch."),
  },
  async ({ url }) => {
    const parsed = await parseLink(url);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            title: parsed.title ?? url,
            text: parsed.text.slice(0, 30000),
          }),
        },
      ],
    };
  },
);
