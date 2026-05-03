/**
 * Prompts for the `auto-title` studio kind — the best-effort title
 * + summary generation that fires on first source ingest when the
 * notebook still has the default title or no description. Verbatim
 * port of the system prompts and prompts in
 * `packages/core/src/ingest/autotitle.ts`.
 */

export const autoTitleSystem =
  "You generate concise notebook titles (3 to 6 words). Respond with only the title text -- no quotes, no punctuation at the end, no prefix like 'Title:'.";

export function autoTitlePrompt(excerpt: string): string {
  return `Suggest a notebook title for a workspace whose first source begins with:\n\n${excerpt}`;
}

export const autoSummarySystem =
  "You generate concise notebook summaries (2 to 3 sentences). Describe what the source material covers and its key topics. Respond with only the summary text -- no quotes, no prefix like 'Summary:'.";

export function autoSummaryPrompt(excerpt: string): string {
  return `Write a 2-3 sentence summary for a notebook whose first source begins with:\n\n${excerpt}`;
}
