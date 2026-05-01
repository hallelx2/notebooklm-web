# notebooklm-web — Roadmap

This document is the living plan for where the project is going. Phases are ordered, but work inside a phase can happen in parallel. If you are picking up a contribution, start by checking which phase the work belongs to.

For the deep technical vision behind the agent harness specifically, see [`docs/AGENT-HARNESS.md`](docs/AGENT-HARNESS.md).

---

## Phase 0 — Where we are today (shipped)

The web version is functional end to end and the foundation every later phase builds on.

- ✅ One Next.js 16 app, App Router, deployed to Vercel
- ✅ Drizzle + Neon Postgres + pgvector with four sibling tables (768/1024/1536/3072 dim)
- ✅ Better Auth with sessions and OAuth
- ✅ Twelve AI providers (OpenAI, Anthropic, Gemini, Mistral, Cohere, Voyage, Groq, Ollama, OpenRouter, Together, xAI, OpenAI-compatible) with AES-GCM encrypted credentials
- ✅ Three-stage retrieval (query expansion → hybrid pgvector + keyword → LLM rerank)
- ✅ Self-critiquing deep research with quality gate, gap-fill round, and verification
- ✅ Two-voice audio overviews (Deepgram Aura Orion + Asteria)
- ✅ Eight studio output kinds (audio, mind map, flashcards, quiz, study guide, briefing, FAQ, timeline, notes)
- ✅ NDJSON streaming with AG-UI event vocabulary
- ✅ Citations as JSONB on the message row, frozen with the answer

---

## Phase 1 — pnpm workspace migration

**Goal:** restructure the repo so the existing web app and the upcoming desktop app share a common core, without duplicating the retrieval pipeline, the AI factory, the schema, or the prompts.

Target structure:

```
notebooklm-web/                  ← workspace root
├── pnpm-workspace.yaml
├── apps/
│   ├── web/                     ← the current Next.js app, moved here
│   └── desktop/                 ← Phase 2 lives here
├── packages/
│   ├── core/                    ← retrieval, ingest, AI factory, prompts, schema
│   ├── adapters/                ← provider/SDK/TTS adapters
│   ├── ui/                      ← shared React components
│   └── tooling/                 ← shared Biome / TS / Drizzle config
└── docs/
```

### What moves into `packages/core`
- `lib/retrieve.ts` (the three-stage retrieval pipeline)
- `lib/ingest/*` (parse, chunk, embed, store)
- `lib/ai/*` (factory + provider registry)
- `lib/crypto/*` (encrypted credentials)
- `db/schema.ts` (Drizzle schema, fully portable)
- All prompts (chat system prompt, retrieval rerank, deep-research planner, self-critique, verification, studio prompts)

### What stays in each app
- Routes, UI, app-specific config, deployment manifests, env handling

### Why this matters
- The desktop app reuses the entire retrieval and agent stack without copy-paste
- New surfaces (CLI, mobile, MCP server) become straightforward additions
- Shared code is versioned and reviewable; behaviour drift is caught at the package boundary

### Contribution shape
This is one big migration done in a single (large) PR or a sequence of smaller ones. If you want to take it on, **open an issue first** so we agree on the boundary lines before you start.

---

## Phase 2 — Local desktop app

**Goal:** a fully local desktop application — same workbench, same retrieval, same studio kinds, but with no cloud dependencies and no API keys required.

Target stack:

| Layer | Local choice | Notes |
|---|---|---|
| Shell | **Tauri 2** (preferred) or Electron | Native window, drag-drop folders, file watcher |
| Chat models | **Ollama** | Llama 3.3, Qwen 2.5, Mistral, anything served at `localhost:11434` |
| Embedding models | **Ollama** (Nomic, mxbai) or **GGUF via llama.cpp** | 768 / 1024 / 1536 / 3072 dim |
| TTS | **Piper** or **Kokoro-82M** | Free, offline, no Deepgram dependency |
| Database | **Embedded Postgres** (e.g. PGlite) or **SQLite + sqlite-vec** | Zero external dependencies |
| Storage | **Local filesystem** | The user's own folders are the source of truth |
| Web search | **Optional** | Local-only mode skips deep-research's web stage |

### What is already in place
- Ollama is supported in the provider registry today
- The AI factory dispatches to OpenAI-compatible adapter for Ollama, OpenRouter, openai_compatible
- Multi-dim embedding tables already accommodate Ollama embedding dims (768 with Nomic, 1024 with mxbai)
- The audio overview architecture is provider-agnostic at the route layer

### What needs to land
- Embedded database adapter (PGlite or SQLite+sqlite-vec) plumbed through the same Drizzle interface
- Piper / Kokoro-82M TTS adapter at the audio overview boundary
- File-system source kind: drop a folder, ingest every file, watch for changes
- Tauri/Electron shell with native menus, file dialogs, drag-and-drop
- Bundled installer for macOS, Windows, Linux

### Contribution shape
Multiple parallel tracks:
- Embedded DB layer
- TTS adapters
- File-system source kind
- Shell scaffolding
- Auto-update story
- Installer pipelines

---

## Phase 3 — Agent harness

**Goal:** the agent runtime becomes pluggable. Today every LLM call goes through the AI SDK uniformly, which is great for portability but limits us to AI-SDK-shaped capabilities. Phase 3 extends the harness so each major **agent SDK** is a backend you can pick per task.

Supported runtimes (target):

- **AI SDK** (Vercel) — current default, generation + tool use + streaming
- **Claude Agent SDK** (Anthropic) — when the task benefits from native Claude tool-use + memory + sub-agents
- **OpenAI Agents SDK** — for native function-calling traces and tool orchestration
- **Copilot Agent SDK** — for IDE-shaped tasks, code-aware retrieval, file-system navigation
- **Local agent runtimes** — Ollama tool calling, llama.cpp grammar-constrained generation, MCP-served agents

### What this enables
- A single notebook can use Gemini Flash for retrieval rerank (cheap), Claude Sonnet via Claude Agent SDK for deep research (best reasoning + sub-agents), Llama 3.3 via Ollama for offline chat (private), and the OpenAI Agents SDK for any flow that needs native function-call traces.
- Per-feature provider selection — not just per-user. The user chooses Gemini Flash as the default, but the deep-research run uses Claude Sonnet because the user marked that feature "premium reasoning."
- BYO-API at every layer — bring your own keys, bring your own SDK adapter, bring your own model.

### Architecture sketch

```
Routes / Studio                   →  Agent Harness                →  Runtime backends

/api/chat                            ┌──────────────────────────┐    ┌─ AI SDK (current)
/api/deep-research      ───────────▶ │   harness.run({          │ ─▶ ├─ Claude Agent SDK
/api/studio/audio-overview           │     task, runtime,       │    ├─ OpenAI Agents SDK
                                     │     provider, model,     │    ├─ Copilot Agent SDK
                                     │     fallback chain       │    └─ Local (Ollama / llama.cpp)
                                     │   })                     │
                                     └──────────────────────────┘
```

The harness sits between the route handlers and the underlying SDKs. It accepts a task descriptor (chat, retrieval-rerank, plan, summarise, self-critique, verify, audio-script, mind-map, etc.), a runtime preference, a provider+model, and an optional fallback chain. It returns a uniform result shape regardless of which SDK ran the work.

### What is already in place
- The AI factory (`lib/ai/factory.ts`) is the seed of the harness. Every call site already goes through it.
- Provider registry, encrypted credentials, model resolution per user — all done.
- Streaming protocol (NDJSON + AI SDK streamText) is shape-agnostic.

### What needs to land
- Task descriptor types and the harness dispatch layer in `packages/core`
- Adapters: `claude-agent-sdk-adapter`, `openai-agents-adapter`, `copilot-agent-adapter`, `ollama-tool-call-adapter`
- Per-task runtime selection in user settings
- Fallback chain semantics (e.g. "if Claude Agent SDK fails, fall back to AI SDK")
- Telemetry that survives backend swaps

See [`docs/AGENT-HARNESS.md`](docs/AGENT-HARNESS.md) for the deep technical vision.

---

## Phase 4 — Marketplace and extensions

**Goal:** make the studio and the harness extensible by community contributors without forking the repo.

- **Studio output marketplace** — third-party studio kinds installable as packages (e.g. flashcard variants, anki export, mermaid diagrams, podcasts in the user's language)
- **Provider plugins** — third-party AI providers and TTS providers as packages
- **Source kind plugins** — connect to Notion, Drive, Linear, GitHub repos as ingest sources
- **MCP server mode** — expose the notebook as an MCP server so other tools can chat with it

Phase 4 is downstream of Phase 1 (workspace) and Phase 3 (harness). Both phases produce the seams that make Phase 4 possible.

---

## Phase 5 — Beyond

Open-ended. Likely candidates:
- Mobile app (React Native, sharing `packages/core`)
- Collaborative notebooks (real-time, multi-user)
- Self-hosted multi-tenant deployments with team-scoped sources
- Vector store backends beyond pgvector (LanceDB, Qdrant, Vespa) — only if pgvector hits a real ceiling

Phase 5 ideas are not committed. They are listed so the door stays open and contributors with strong opinions know there is room to argue for them.

---

## How to read this roadmap

Phases are **rough ordering, not strict gates**. If a contributor wants to start on a Phase 3 adapter today, the way to do it is to open an issue describing the work, agree on the interface, and ship a self-contained PR. The phase numbers are about *priority of attention*, not *blocked-ness*.

The headline phases — **1 (workspace), 2 (desktop), 3 (harness)** — are where the project earns its differentiation against existing open-source NotebookLMs. Contributions to those phases are the most valuable, and the project will move forward fastest when collaborators take ownership of slices of them.
