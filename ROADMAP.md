# notebooklm-web — Roadmap

This document is the living plan for where the project is going. Phases are ordered, but work inside a phase can happen in parallel. For per-release history, see [`CHANGELOG.md`](CHANGELOG.md). For the deep technical vision behind the agent harness specifically, see [`docs/AGENT-HARNESS.md`](docs/AGENT-HARNESS.md).

**Status legend:** ✅ shipped · 🟡 partially landed · 🟦 next up · 🔵 future

---

## Phase 0 — The four-day web build ✅ *(Apr 2026)*

The original web version, documented in the [whitepaper](docs/demo/NotebookLM-in-Four-Days-Whitepaper.pdf). Foundation every later phase builds on.

- ✅ Next.js 16 App Router app deployed to Vercel
- ✅ Drizzle + Neon Postgres + pgvector with four sibling tables (768 / 1024 / 1536 / 3072 dim)
- ✅ Better Auth with sessions and OAuth
- ✅ Twelve AI providers with AES-GCM encrypted credentials (now thirteen, with the bundled `local` provider)
- ✅ Three-stage retrieval (query expansion → hybrid pgvector + keyword → LLM rerank)
- ✅ Self-critiquing deep research with quality gate, gap-fill round, and verification
- ✅ Two-voice audio overviews (Deepgram Aura Orion + Asteria)
- ✅ Eight studio output kinds (audio, mind map, flashcards, quiz, study guide, briefing, FAQ, timeline, notes)
- ✅ Streaming everywhere — SSE / NDJSON, AI SDK `streamText` for chat
- ✅ Citations as JSONB on the message row, frozen with the answer

---

## Phase 1 — Workspace migration ✅ *(May 3, 2026 — [PR #1](https://github.com/hallelx2/notebooklm-web/pull/1))*

**Delivered.** Repo moved from a flat `src/` Next.js app to a **Bun workspace** (not pnpm — Bun chosen for the faster install and the desktop's native `bun --filter` compatibility). Shared code now lives in `packages/core` (retrieval, ingest, AI factory, prompts, schema), `packages/server` (Hono + tRPC + handlers), and `packages/ui` (React components and views). Each app owns its own surface in `apps/web` and `apps/desktop`.

```
notebooklm-web/
├── bun.lock
├── package.json (workspaces: apps/*, packages/*)
├── apps/
│   ├── web/                     # Next.js 16 hosted app
│   └── desktop/                 # Electron shell
├── packages/
│   ├── core/                    # retrieval, ingest, agent, AI, TTS, storage, schema
│   ├── server/                  # Hono app + tRPC routers + handlers
│   └── ui/                      # shared React components and views
└── docs/
```

Why Bun over pnpm: identical workspace ergonomics, faster cold install, native `bun --filter` matches the existing toolchain. The original ROADMAP entry asked for pnpm; the implementation chose Bun and the rest of the tooling followed.

---

## Phase 2 — Local desktop app ✅ *(May 5 – May 11, 2026 — `v0.1.9` → `v0.3.0`)*

**Delivered.** Native Electron app with embedded PGlite, local-FS storage, Kokoro TTS + local embeddings in utility processes, SearxNG auto-start, and Windows/macOS/Linux installer pipelines via electron-builder + GitHub Actions.

| Layer | What shipped |
|---|---|
| Shell | **Electron 33** (Tauri was the original preference; Electron chosen for the Hono+esbuild bundle compatibility and the existing Node ecosystem). Single-instance lock, platform-specific window chrome, IPC for menu commands. |
| Chat models | All 13 AI SDK providers, including **Ollama** for offline use. |
| Embedding models | Ollama (Nomic / mxbai / etc.), provider APIs, plus a **bundled local** sentence-transformer that runs in a utility process with zero credentials. |
| TTS | **Kokoro** running in `tts-worker.cjs` (utility process) so ONNX preprocessing stays off the main event loop. Deepgram still available for the web path. |
| Database | **PGlite** (embedded Postgres + pgvector) via the same Drizzle schema and `PlatformAdapter` interface. |
| Storage | **Local filesystem** under `~/.notebooklm/storage/`. |
| Web search | **SearxNG auto-start** — Docker Compose stack copied to `~/.notebooklm/searxng/` on first launch, brought up automatically if Docker is available. Exa + Tavily also supported. |
| Auto-update | **electron-updater** reading the `latest*.yml` manifests attached to each GitHub release. |
| Installers | NSIS `.exe` (Windows), `.dmg` (macOS arm64), `.deb` + `.AppImage` (Linux). Tag a release locally; the `release-desktop` GitHub Actions workflow builds and attaches the installers. |

The `apps/desktop/README.md` covers keyboard shortcuts, `~/.notebooklm/` data layout, the `ELECTRON_RUN_AS_NODE` trap, the SearxNG manager, and custom-icon swapping.

Open items deliberately deferred:
- 🟦 **File-system source kind** — drop a folder, ingest every file recursively, watch for changes. Currently file uploads are one-at-a-time via the modal.
- 🟦 **Code signing + notarization** — installers currently unsigned. macOS shows "developer cannot be verified", Windows SmartScreen prompts.
- 🟦 **macOS x64 dmg** — only arm64 ships today.

---

## Phase 3 — Agent harness 🟡 *(partial — `v0.3.0`)*

**Goal:** the agent runtime becomes pluggable. Today every LLM call goes through the AI SDK uniformly, which is great for portability but limits us to AI-SDK-shaped capabilities. Phase 3 extends the harness so each major **agent SDK** is a backend you can pick per task.

### What just landed in `v0.3.0` 🟡

The **notebook research pipeline** in `packages/core/src/notebook-research.ts` is the first real harness output. It's a six-phase orchestration (`recon → plan → retrieve → synthesize → reflect → augment → assemble`) that drives every studio kind from a single curated research artifact rather than chunk concatenation. It runs through the AI SDK runtime today, but the phase prompts and `withRetry` retry semantics are SDK-agnostic — they'll work behind any future adapter without code change.

Also landed in `packages/core/src/agent/runtimes/`:
- ✅ AI SDK runtime (default) — generation + tool use + streaming, behind a task descriptor (`chat`, `rerank`, `research`, `audio-script`, etc.).
- ✅ Optional Claude Agent SDK opt-in for desktop via `NOTEBOOKLM_ENABLE_CLAUDE_AGENT_SDK=1` (currently used by the deep-research flow when enabled — see `apps/desktop/.env.example`).

### Supported runtimes (target)

- ✅ **AI SDK** (Vercel) — current default
- 🟡 **Claude Agent SDK** (Anthropic) — opt-in via env var for deep-research only; not yet generalised across tasks
- 🟦 **OpenAI Agents SDK** — for native function-calling traces and tool orchestration
- 🟦 **Copilot Agent SDK** — for IDE-shaped tasks, code-aware retrieval, file-system navigation
- 🟦 **Local agent runtimes** — Ollama tool calling, llama.cpp grammar-constrained generation, MCP-served agents

### What this enables

- A single notebook can use Gemini Flash for retrieval rerank (cheap), Claude Sonnet via Claude Agent SDK for deep research (best reasoning + sub-agents), Llama 3.3 via Ollama for offline chat (private), and the OpenAI Agents SDK for any flow that needs native function-call traces.
- Per-feature provider selection — not just per-user. The user chooses Gemini Flash as the default, but the deep-research run uses Claude Sonnet because the user marked that feature "premium reasoning."
- BYO-API at every layer — bring your own keys, bring your own SDK adapter, bring your own model.

### Architecture sketch

```
Routes / Studio                   →  Agent Harness                →  Runtime backends

/api/chat                            ┌──────────────────────────┐    ┌─ AI SDK ✅
/api/deep-research      ───────────▶ │   runAgent({ kind:       │ ─▶ ├─ Claude Agent SDK 🟡 (opt-in)
/api/studio/audio-overview           │     task, userId, … },   │    ├─ OpenAI Agents SDK 🟦
notebook-research pipeline           │     runtimes,            │    ├─ Copilot Agent SDK 🟦
                                     │     opts                 │    └─ Local (Ollama / llama.cpp / MCP) 🟦
                                     │   })                     │
                                     └──────────────────────────┘
```

The harness sits between the route handlers and the underlying SDKs. It accepts a task descriptor (`chat`, `rerank`, `research`, `audio-script`, etc.), a runtime preference, a provider+model, and an optional fallback chain. It returns a uniform result shape regardless of which SDK ran the work. The dispatch layer is `runAgent()` in `packages/core/src/agent/`.

### What still needs to land

- 🟦 First-class Claude Agent SDK adapter that handles every task descriptor, not just deep-research.
- 🟦 OpenAI Agents SDK adapter.
- 🟦 Copilot Agent SDK adapter.
- 🟦 Per-task runtime selection surfaced in user settings (today: env var only).
- 🟦 Fallback chain semantics — e.g. "if Claude Agent SDK fails, fall back to AI SDK with same prompt."
- 🟦 Telemetry that survives backend swaps (token counts, latency, cost per task).

See [`docs/AGENT-HARNESS.md`](docs/AGENT-HARNESS.md) for the deep technical vision.

---

## Phase 4 — Marketplace and extensions 🔵 *(future)*

**Goal:** make the studio, the harness, and the source kinds extensible by community contributors without forking the repo.

- 🔵 **Studio output marketplace** — third-party studio kinds installable as packages (flashcard variants, Anki export, Mermaid diagrams, podcasts in other languages, custom report templates). The seam already exists: `renderArtifactForKind(artifact, kind)` in `packages/core/src/notebook-research.ts` plus a prompt file in `agent/runtimes/ai-sdk/prompts/` is all a new kind needs.
- 🔵 **Provider plugins** — third-party AI providers and TTS providers as packages, dropped into `packages/core/src/ai/providers.ts` and the TTS adapter registry.
- 🔵 **Source kind plugins** — connect to Notion, Drive, Linear, GitHub repos, RSS, email as ingest sources. Sits alongside the existing `parsePdf` / `parseLink` / `parseText` dispatch in `packages/core/src/ingest/parse.ts`.
- 🔵 **MCP server mode** — expose the notebook as an MCP server so other tools (Claude Desktop, Cursor, custom agents) can chat with it.

Phase 4 is downstream of Phase 3 (harness adapters). The agent harness produces the seams that make most of Phase 4 possible.

---

## Phase 5 — Beyond 🔵

Open-ended. Listed so the door stays open for contributors with strong opinions:

- 🔵 **File-system source kind** — drop a folder, ingest every file recursively, watch for changes. (Carried over from Phase 2's deferred list.)
- 🔵 **Mobile app** — React Native, sharing `packages/core` and `packages/ui` where possible.
- 🔵 **Collaborative notebooks** — real-time, multi-user editing and chat.
- 🔵 **Self-hosted multi-tenant deployments** — team-scoped sources, SSO, audit logs.
- 🔵 **Vector store backends beyond pgvector** — LanceDB, Qdrant, Vespa, Turbopuffer. Only if pgvector hits a real ceiling — current HNSW indexes scale comfortably into the millions of chunks.
- 🔵 **Code signing + notarization** — signed Windows / macOS installers so SmartScreen and Gatekeeper stop warning users. (Carried over from Phase 2's deferred list.)

Phase 5 ideas are not committed.

---

## How to read this roadmap

Phases are **rough ordering, not strict gates**. If a contributor wants to start on a Phase 3 adapter today, the way to do it is to open an issue describing the work, agree on the interface, and ship a self-contained PR. The phase numbers are about *priority of attention*, not *blocked-ness*.

With Phases 1 and 2 delivered and Phase 3 partially landed, the most valuable contributions right now are:

1. **Generalising the Claude Agent SDK adapter** (Phase 3 — currently only handles deep-research)
2. **The OpenAI Agents SDK adapter** (Phase 3)
3. **First-party studio kind plugins** that prove the marketplace seam (Phase 4 ↔ Phase 3)
4. **File-system source kind for the desktop app** (Phase 2 carryover ↔ Phase 5)

Per-release history is in [`CHANGELOG.md`](CHANGELOG.md).
