# AI SDK runtime

Default in-process runtime backed by Vercel's [AI SDK](https://sdk.vercel.ai).

## What lives here

- `index.ts` — the `AgentAdapter` implementation. Switches on `task.kind`
  and dispatches to `streamText` / `generateObject` against the user's
  BYOK provider (resolved via `getChatModel(userId)`).
- `tools/` — AI-SDK-shaped tools (`tool({ parameters: z.object(...), execute })`).
  Each one calls a shared utility from `packages/core` (e.g. `retrieveForQuery`,
  `webSearch`) — no business logic lives in this folder.
- `hooks/` — `streamText`'s `onChunk` / `onStepFinish` callbacks. Used to
  extract `(chunk:UUID)` markers from generated text and emit `citation`
  events alongside `text-delta`.
- `prompts/` — every system prompt currently inlined in handlers, moved
  here for reuse and A/B testing.

## Provider coverage

This runtime supports every provider in `packages/core/src/ai/providers.ts` —
OpenAI, Anthropic, Google, Mistral, Cohere, Voyage, Groq, **Ollama**, OpenRouter,
Together, xAI, OpenAI-compatible. The harness doesn't need a separate "Ollama
runtime"; Ollama is reachable via `@ai-sdk/openai-compatible` pointed at
`localhost:11434`.

## When the harness picks this runtime

- It's the safe default for everyone — `available()` always returns `true`
  as long as the user has any BYOK provider configured.
- Preferred for `rerank` (single-shot scoring; no agent loop overhead worth
  paying).
- Fallback for `chat` / `research` / `studio` when a more specific runtime
  (Claude Agent SDK, Copilot CLI) is unavailable.
