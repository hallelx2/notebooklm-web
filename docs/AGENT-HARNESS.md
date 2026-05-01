# The Agent Harness — Future Vision

> This document is the technical vision for Phase 3 of the [roadmap](../ROADMAP.md). It is forward-looking and partially speculative. Some pieces are already in place; others are deliberate design proposals open for discussion. **Open an issue to argue with anything below.**

---

## What an agent harness is

The current architecture treats every LLM call as "go through the AI SDK." That is the right default and it is what shipped in v1. It gives us:

- Provider portability (twelve providers via one uniform `LanguageModel` interface)
- Streaming with backpressure (handled by the SDK)
- Structured output via Zod schemas
- Tool calling

What it does *not* give us is access to **provider-specific agent capabilities**. Anthropic's Claude Agent SDK has native multi-turn agent loops with persistent memory and sub-agents. OpenAI's Agents SDK has native function-call traces and graph-shaped agent orchestration. Microsoft's Copilot Agent SDK has IDE-aware tool integrations. Local agent runtimes (Ollama tool calling, llama.cpp grammar-constrained generation, MCP-served agents) have privacy, offline operation, and zero per-call cost.

Each of those provides capability beyond what the AI SDK alone exposes. The harness is the layer that lets a single notebook product use **the right SDK for the right task**, without forking the codebase.

---

## The principle

> *Tasks have shapes. Each shape is best served by a particular runtime backend. The harness is what dispatches the task to the right backend without the task code having to know which backend it is.*

Concretely:

- **Retrieval rerank** is a stateless one-shot scoring task. AI SDK's `generateObject` is perfect.
- **Deep research** is a long-running agentic task with sub-questions, parallel tool calls, self-critique, and gap-filling. Claude Agent SDK with sub-agents is a strong fit.
- **Code-aware retrieval** (when ingesting a Git repository) benefits from IDE-shaped tool integrations. Copilot Agent SDK's file-system tools are exactly what is needed.
- **Offline chat** has to run with no API key. Ollama tool calling, possibly with MCP-served retrieval as a tool, is the right backend.
- **Audio script generation** is a stateless long-form text task with a structured output schema. AI SDK is fine; no need for an agent SDK.

Today every one of those goes through the same `getChatModel(userId)` call. That is good portability and bad capability. The harness fixes the second without sacrificing the first.

---

## The architecture

```
                                              ┌────────────────────────────┐
                                              │      Agent Harness         │
                                              │                            │
                                              │  harness.run({             │
                                              │    task,                   │
                                              │    runtime,    ◀── per-task │
                                              │    provider,                │
                                              │    model,                   │
                                              │    fallback,                │
                                              │  })                         │
                                              │                            │
                                              └────────────┬───────────────┘
                                                           │
                            ┌──────────────────────────────┼──────────────────────────────┐
                            ▼                              ▼                              ▼
                  ┌──────────────────┐           ┌──────────────────┐           ┌──────────────────┐
                  │   AI SDK         │           │  Claude Agent    │           │  Local Agent     │
                  │   Adapter        │           │  SDK Adapter     │           │  Adapter         │
                  │                  │           │                  │           │                  │
                  │ generateText     │           │ runAgent         │           │ ollama tool call │
                  │ generateObject   │           │ + sub-agents     │           │ MCP tools        │
                  │ streamText       │           │ + memory         │           │ llama.cpp grammar│
                  └──────────────────┘           └──────────────────┘           └──────────────────┘

                  ┌──────────────────┐           ┌──────────────────┐
                  │  OpenAI Agents   │           │  Copilot Agent   │
                  │  SDK Adapter     │           │  SDK Adapter     │
                  │                  │           │                  │
                  │ runAgent         │           │ codespace tools  │
                  │ + tool traces    │           │ + workspace fs   │
                  └──────────────────┘           └──────────────────┘
```

Routes and studio mutations call `harness.run({ task, runtime, ... })`. The harness selects the adapter, executes the task on the chosen runtime, and returns a uniform result shape regardless of which SDK ran the work.

---

## The task descriptor

Each task has a typed descriptor that the harness understands. Roughly:

```ts
type TaskDescriptor =
  | { kind: "chat"; messages: UIMessage[]; system: string; tools?: Tool[] }
  | { kind: "rerank"; query: string; chunks: Chunk[]; topK: number }
  | { kind: "expand-query"; query: string }
  | { kind: "plan-research"; question: string; existing: SourceSummary[] }
  | { kind: "summarise-source"; url: string; content: string }
  | { kind: "outline-report"; question: string; sources: Summary[] }
  | { kind: "write-section"; section: SectionPlan; sources: Summary[] }
  | { kind: "self-critique"; report: string; question: string }
  | { kind: "verify-claims"; report: string; sources: Source[] }
  | { kind: "audio-script"; sources: Source[] }
  | { kind: "studio-generic"; promptKind: StudioKind; sourceContent: string }
  | { kind: "embed"; texts: string[] };
```

Each task has a default runtime, a default provider, and a default model — but every one of those can be overridden per call. A user's chat preference might be Gemini Flash via AI SDK; their deep-research preference might be Claude Sonnet via Claude Agent SDK; their offline mode might pin everything to Ollama.

---

## The runtime backends, in detail

### AI SDK (Vercel) — current default

**What it gives us:** uniform interface across 12 providers, streaming, structured output, tool calling.

**What it is best at:** stateless one-shot tasks (rerank, summarise, single-section write, embed). Anything where the task is "give me text or structured data based on this prompt."

**What it is not great at:** long-running multi-turn agent loops with sub-agents, persistent memory, and complex orchestration. You can build those on top of `streamText` with manual loop control, but you are reimplementing what the dedicated agent SDKs ship.

**Already in place:** every LLM call in v1.

### Claude Agent SDK (Anthropic)

**What it gives us:** native agent loops, persistent memory, sub-agents, tool-use orchestration optimised for Claude's reasoning model.

**What it is best at:** deep research, multi-step tasks where the model benefits from running several rounds of "reason, act, reflect" with tool access. The verification step would also fit here naturally.

**Why we want it:** the deep-research route's quality gate, gap-fill, and verification are exactly what Claude Agent SDK was designed for. We currently implement them as a hand-rolled loop in 700+ lines of route-handler code. With the SDK, we get persistent memory across the whole research run for free, and sub-agents become first-class so each sub-question can have its own dedicated agent loop.

**What needs to land:** an adapter that translates a `plan-research` or `write-section` task into Claude Agent SDK calls, returning the same NDJSON event stream the front-end already consumes.

### OpenAI Agents SDK

**What it gives us:** native function-call traces, graph-shaped agent orchestration, the OpenAI Assistants threading model.

**What it is best at:** tasks where the user wants reproducible function-call traces (compliance, debugging) or where the OpenAI fine-tuned models specifically have an edge.

**Why we want it:** users on the OpenAI track (which is many of them) get a measurably better experience for tool-heavy tasks when running through the native SDK rather than the AI SDK's wrapper.

**What needs to land:** an adapter for `chat` and `plan-research` tasks that uses Threads + Runs under the hood.

### Copilot Agent SDK (Microsoft)

**What it gives us:** IDE-aware tool integrations — file-system navigation, codebase-aware retrieval, terminal access, workspace context.

**What it is best at:** code repositories as sources. When the user drops a Git repo into a notebook, Copilot Agent SDK can navigate it like it would in VS Code, with the right tooling for "find the function that does X" rather than just "find the chunk that mentions X."

**Why we want it:** opens a category — *NotebookLM for codebases* — that the cloud-shaped competitors do not address well.

**What needs to land:** a code-source kind that ingests via Copilot Agent SDK rather than the standard chunker, and a code-aware retrieval path that uses CASDK's workspace tools.

### Local agent runtimes

**What it gives us:** privacy, offline operation, zero per-call cost.

**The candidates:**

- **Ollama tool calling.** Recent Ollama versions support function-call schemas natively for models that have been fine-tuned for it (Llama 3.3, Qwen 2.5). Adapter is straightforward.
- **llama.cpp grammar-constrained generation.** Strict structured output via grammar files. Useful when the model is small and we want the structured-output schema enforced at generation time rather than post-hoc.
- **MCP-served agents.** Run the agent loop in a separate process exposing an MCP interface; the harness talks to it as a runtime. Useful for sandboxing and for integrating with the broader MCP ecosystem.

**What is best:** offline chat, offline retrieval rerank, offline studio generation. The desktop app (Phase 2) is the obvious consumer.

---

## Bring-your-own-everything

The harness preserves and extends the BYO model already shipping in v1:

- **BYO API keys** — the encrypted credential vault works for every provider, including new SDK backends. Adding Claude Agent SDK does not require a separate auth flow; the existing Anthropic credential is the same one the SDK uses.
- **BYO models** — the registry already supports custom models on Ollama, OpenRouter, OpenAI-compatible. The harness extends this to runtime backends — a user can wire their own custom Copilot-Agent-shaped runtime if they want.
- **BYO SDK adapter** — third-party adapters can be installed as packages once Phase 4 (marketplace) lands. A user who wants to use a different agent SDK we have not adopted yet can ship an adapter package; the harness loads it dynamically.

---

## Multi-model orchestration in one notebook

The harness enables a workflow that v1 cannot express:

- The user types a question into chat
- Retrieval rerank runs on **Gemini Flash** (cheap, fast, good enough)
- The chat response streams from **Claude Sonnet 4.5** (best reasoning, native streaming)
- The user clicks "deep research"
- Plan stage runs on **Claude Sonnet 4.5 via Claude Agent SDK** with sub-agents per sub-question
- Each sub-question's source-summarisation runs on **Gemini Flash via AI SDK** (parallel, cheap)
- Self-critique runs on **Claude Opus 4.5 via Claude Agent SDK** (best critique judgement)
- Final verification runs on **GPT-4o via OpenAI Agents SDK** (independent eyes, native tool traces for compliance)
- The user clicks "audio overview"
- Script generation runs on **Gemini Flash via AI SDK** (cheap structured output)
- TTS runs on **Deepgram** (cloud) or **Piper** (local) per the user's preference

Six different models. Three different runtimes. One product. The user does not orchestrate this manually — they pick reasonable defaults at signup, and each task uses the right backend without their attention.

---

## Per-task settings UI

In the settings page today, the user picks a chat provider/model and an embedding provider/model. With the harness, settings become per-task:

```
Chat
  Default                              [ Gemini 2.5 Flash via AI SDK         ▾ ]

Retrieval rerank
  Default                              [ Gemini 2.5 Flash via AI SDK         ▾ ]

Deep research
  Plan + write                         [ Claude Sonnet 4.5 via Agent SDK     ▾ ]
  Source summarisation                 [ Gemini 2.5 Flash via AI SDK         ▾ ]
  Self-critique                        [ Claude Opus 4.5 via Agent SDK       ▾ ]
  Verification                         [ GPT-4o via Agents SDK               ▾ ]

Audio overview
  Script generation                    [ Gemini 2.5 Flash via AI SDK         ▾ ]
  TTS                                  [ Deepgram Aura  ●  Piper             ▾ ]

Embedding
  Default                              [ gemini-embedding-001 (768 dim)      ▾ ]
```

Sensible defaults for every task, fine-grained override for users who care. The harness is the seam that makes this possible.

---

## Fallback chains

When a backend fails (rate limit, network error, model overloaded), the harness can fall back to a configured chain instead of returning an error:

```ts
harness.run({
  task: { kind: "chat", ... },
  runtime: "claude-agent-sdk",
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  fallback: [
    { runtime: "ai-sdk", provider: "anthropic", model: "claude-haiku-4-5" },
    { runtime: "ai-sdk", provider: "google", model: "gemini-2.5-flash" },
  ],
});
```

If Claude Sonnet via Claude Agent SDK rate-limits, the harness retries on Claude Haiku via AI SDK; if that also fails, it falls back to Gemini Flash. The user gets a response; the system telemetry records that the primary failed and the fallback succeeded.

This is one of the highest-leverage features in the harness. Production AI products live or die on graceful degradation, and the harness is where graceful degradation has to live.

---

## Telemetry that survives backend swaps

When a single chat message goes through three different backends (rerank on AI SDK, response on Claude Agent SDK, audio overview on AI SDK + Piper), telemetry has to give the operator a coherent view across all three. The harness emits structured spans:

```
chat-message
├── retrieval (3-stage)
│   ├── expand-query  · ai-sdk · gemini-2.5-flash · 312ms · 250 tokens
│   ├── vector-search · pgvector · 14 hits · 8ms
│   ├── keyword-search · pgvector · 9 hits · 4ms
│   └── rerank · ai-sdk · gemini-2.5-flash · 421ms · 3100 tokens
└── chat-response · claude-agent-sdk · sonnet-4.5 · 4.2s · 850 tokens
```

Each span records the runtime, provider, model, latency, and token usage. The operator can see at a glance which backend cost what and which one was the bottleneck. Telemetry is the same shape regardless of backend; the harness normalises.

---

## What ships first

The harness lands incrementally. The first version is small:

1. Define the `TaskDescriptor` types and the `harness.run` interface in `packages/core`
2. Implement the AI SDK adapter (this is mostly relocation of existing code)
3. Implement the Claude Agent SDK adapter for the deep-research path specifically (highest payoff for the most-used long-running task)
4. Add per-task settings to the user config schema
5. Add the fallback chain semantics
6. Add structured telemetry spans

That is roughly the v1 of the harness. From there the OpenAI Agents SDK adapter, Copilot Agent SDK adapter, and local-runtime adapters land in subsequent phases.

---

## Open questions

The harness is a design that has not yet been built. Some open questions where contributor input would be welcome:

1. **Streaming across backend boundaries.** Each SDK has its own streaming primitive. Should the harness define a normalised stream type that all adapters emit, or should it pass through the underlying stream and let the consumer adapt?
2. **Memory and context across runtimes.** Claude Agent SDK has persistent memory; AI SDK does not. Should the harness expose a memory interface that adapters can implement (or not), and let the route handler decide whether to use it?
3. **Cost tracking.** Per-call cost is a function of provider + model + tokens. The harness could surface a cost estimate before the call (so the UI can show "this deep research will cost ~$0.40") and a real cost after. Where does the cost table live?
4. **Multi-step tasks across multiple users.** A team-shared notebook (Phase 5) might run a deep-research with one user's Anthropic key and another user's OpenAI key. The harness needs a credential-resolution layer that handles this.
5. **MCP integration.** MCP is becoming the lingua franca for agent tools. Should the harness consume MCP directly as a runtime backend, or always via a specific SDK?

If you have strong opinions on any of these, **open an issue and argue them.** The shape of the harness is genuinely up for debate, and the project is small enough that early contributors can shape its direction.

---

## Why this matters

A product that orchestrates LLMs is only as good as the seams between its layers. The harness is the seam between the application layer (routes, studio mutations) and the model layer (SDKs, providers). Done well, it is the difference between *"a product that uses a model"* and *"a product that uses the right model for each task automatically."*

Most "AI app" products today are stuck at the first phase. The harness is what gets us to the second.
