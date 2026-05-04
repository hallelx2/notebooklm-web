/**
 * AI SDK v6 tools barrel. Each tool is a thin wrapper around an
 * already-tested helper from `@notebooklm/core` so the runtime keeps a
 * single source of truth for retrieval, web search, and link parsing.
 *
 * - `retrieveSourcesTool({ userId, notebookId })` — bound per-call;
 *   wraps `retrieveForQuery`.
 * - `webSearchTool({ userId? })` — bound per-call so wrapped
 *   `webSearch` resolves the user's saved search creds before
 *   falling back to env vars.
 * - `parseLinkTool` — singleton; wraps `parseLink`.
 *
 * Defined but not wired into any task in the current ai-sdk runtime —
 * the existing handlers do retrieval/search/parse synchronously around
 * the model call. Available for future tasks that want tool-call-mediated
 * mid-stream retrieval (e.g. agentic chat).
 */
export { parseLinkTool } from "./parse-link";
export { retrieveSourcesTool } from "./retrieve-sources";
export { webSearchTool } from "./web-search";
