# Claude Agent SDK runtime

Anthropic's [`@anthropic-ai/claude-agent-sdk`](https://docs.anthropic.com/en/api/agent-sdk) —
in-process agent loop with native sub-agents, lifecycle hooks, persistent
memory, and MCP server integration.

## What lives here

- `index.ts` — the `AgentAdapter` implementation. Calls the SDK's
  `query({ prompt, options })` and translates its block stream into our
  `AgentEvent` stream.
- `tools/` — SDK-shaped tool definitions (the SDK uses its own `defineTool`
  signature, not AI SDK's `tool()`). Each tool's body still calls the
  shared utility (`retrieveForQuery`, `webSearch`) — only the registration
  differs from the AI SDK runtime.
- `hooks/` — the SDK's lifecycle hooks. This is where the SDK's strengths
  show up:
  - `pre-tool-use.ts` — block / log / mutate before a tool fires (e.g.
    refuse `web_search` when deep mode is off).
  - `post-tool-use.ts` — citation tracking, usage attribution.
  - `user-prompt-submit.ts` — inject the notebook's existing sources into
    the agent's context window when the task is `research`.
  - `session-start.ts`, `session-end.ts` — bracketing for tracing.
- `subagents/` — multi-agent orchestration. The current 700-line
  `deep-research` handler manually plans, scores, summarises, drafts, and
  self-critiques; this directory replaces that logic with native sub-agent
  definitions:
  - `research-planner.ts` — decomposes the user query into sub-questions.
  - `source-summarizer.ts` — per-source key-fact extraction.
  - `report-writer.ts` — drafts each section of the final report.
  - `self-critic.ts` — scores the report, identifies gaps, requests round 2.
- `mcp/` — placeholder for Phase 4 MCP server integrations (filesystem,
  Postgres, etc.). Empty for now.
- `prompts/` — top-level system prompts that coordinate the sub-agents.

## When the harness picks this runtime

- Only when `userAiConfig.chatProvider === "anthropic"` AND the user has a
  decryptable Anthropic credential. `available()` returns `false`
  otherwise so the harness falls back to `ai-sdk` transparently.
- Preferred for `research` (the multi-round loop is exactly what the SDK
  is designed for).
- Optional for `chat` / `studio` (works fine, but no big win over AI SDK
  unless the user wants the native tool-call traces).
- `supports({ kind: "rerank" })` returns `false` — single-shot scoring,
  no agent overhead worth paying. Falls through to `ai-sdk`.
