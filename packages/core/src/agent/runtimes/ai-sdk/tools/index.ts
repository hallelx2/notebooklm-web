/**
 * AI SDK v6 tools barrel. Each tool is a thin wrapper around an
 * already-tested helper from `@notebooklm/core` so the runtime keeps a
 * single source of truth for retrieval, web search, and link parsing.
 *
 * - `retrieveSourcesTool({ userId, notebookId })` — bound per-call;
 *   wraps `retrieveForQuery`.
 * - `webSearchTool` — singleton; wraps `webSearch`.
 * - `parseLinkTool` — singleton; wraps `parseLink`.
 *
 * In commit 2 these are defined but not wired into any task — the
 * existing handlers do retrieval/search/parse synchronously around the
 * model call, and the harness adapter matches that behaviour. Future
 * work (or callers configuring tool-using tasks) can pull these in via
 * `tools: { retrieveSources, webSearch, parseLink }` on `streamText`.
 */
export { parseLinkTool } from "./parse-link";
export { retrieveSourcesTool } from "./retrieve-sources";
export { webSearchTool } from "./web-search";
