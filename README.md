<div align="center">

# notebooklm-web

**An open-source, self-hostable, local-first NotebookLM. Ships as a hosted web app and a native desktop app from one Bun monorepo.**

Three-stage hybrid retrieval. Self-critiquing deep research. Two-voice audio overviews. Mind maps, flashcards, quizzes, study guides. Studio outputs that research the notebook before they write. Thirteen AI providers with encrypted credentials. One web app + one desktop app, one shared core.

[![Star](https://img.shields.io/github/stars/hallelx2/notebooklm-web?style=flat-square&logo=github&color=2563EB)](https://github.com/hallelx2/notebooklm-web/stargazers)
[![Fork](https://img.shields.io/github/forks/hallelx2/notebooklm-web?style=flat-square&logo=github&color=2563EB)](https://github.com/hallelx2/notebooklm-web/network/members)
[![License](https://img.shields.io/badge/license-MIT-2563EB?style=flat-square)](LICENSE)
[![Latest release](https://img.shields.io/github/v/release/hallelx2/notebooklm-web?style=flat-square&color=10B981)](https://github.com/hallelx2/notebooklm-web/releases/latest)
[![Whitepaper](https://img.shields.io/badge/whitepaper-45_pages-F59E0B?style=flat-square&logo=adobe-acrobat-reader&logoColor=white)](docs/demo/NotebookLM-in-Four-Days-Whitepaper.pdf)

![demo](docs/demo/demo.gif)

*A 28-second tour at 25× speed. Drop in a PDF, chat with citations, run multi-round web research, generate a two-host audio overview, and walk a mind map of your sources.*

</div>

---

## What you get

- 📚 **Drop in any source** — PDF (URL or upload, with `%PDF` magic-byte routing), web link (Readability extraction), pasted text. Every source walks the same parse → chunk → embed → store pipe.
- 💬 **Chat with citations** — three-stage retrieval (query expansion → hybrid pgvector + keyword → LLM rerank). Every claim cites the chunk it came from. Click a citation to jump to the source.
- 🔬 **Deep research** — multi-round web research with self-critique. The agent plans sub-questions aware of your existing notebook, fetches sources via Exa / Tavily / SearxNG, summarises, drafts section by section, scores its own quality, fills gaps in a second round, and cross-references every claim. Output saves as a new source you can chat with.
- 🧪 **Studio outputs that research first** *(new in v0.3.0)* — every studio kind (mind map, briefing doc, study guide, FAQ, timeline, flashcards, quiz, audio overview) generates from a citation-grounded research artifact via a six-phase pipeline (recon → plan → retrieve → synthesize → reflect → augment → assemble), cached per `(notebook fingerprint × chat model × user query)`. Phase progress streams live in the panel.
- 🎙️ **Two-voice audio overviews** — Deepgram Aura on web, **Kokoro local** in a utility process on desktop. Scripted as a podcast conversation, rendered as MP3, fully offline-capable.
- 🧠 **Eight studio kinds** — mind maps (markmap, click-to-expand + shift-click-to-chat), flashcards, quizzes (with scoring), study guides, briefing docs, FAQs, timelines, audio overviews, and user-authored notes.
- 🔌 **Thirteen AI providers** — OpenAI, Anthropic, Google Gemini, Mistral, Cohere, Voyage, Groq, Ollama (self-hosted), OpenRouter, Together AI, xAI, any OpenAI-compatible endpoint, plus a bundled **local** provider that runs sentence-transformers via `@huggingface/transformers` with zero credentials. Switch per user, no code changes.
- 🔐 **Encrypted credentials** — AES-GCM at rest with versioned keys and userId as AAD. Plaintext API keys never live in the database.
- 📐 **Multi-dimensional embeddings** — sibling tables for 384 / 768 / 1024 / 1536 / 3072 dims with HNSW cosine indexes. Switching embedding models is non-destructive; retrieval scopes to the user's current model.
- 📡 **Streaming everywhere** — SSE for deep research and audio overviews, AI SDK `streamText` for chat, jsonb progress columns for tRPC-polled flows. Every phase the agent takes is a UI event.
- 🖥️ **Native desktop + hosted web from one codebase** — same Hono server, tRPC routers, retrieval pipeline, and React components. Desktop swaps Neon Postgres for PGlite, S3 storage for local-FS, and adds utility-process workers for Kokoro TTS + local embeddings so ONNX work never blocks the window.

## Why this project

Most "build a NotebookLM clone" tutorials ship a 200-line demo that breaks the moment you put it in front of a real user. This is the opposite — a real, shipped, opinionated implementation that you can study, fork, run yourself, or use as the substrate for your own product.

The full architectural breakdown — every chapter, every code path, every decision — is in **[the 45-page whitepaper](docs/demo/NotebookLM-in-Four-Days-Whitepaper.pdf)**. If you are building anything RAG-flavoured right now, that PDF is the cheat sheet.

## ⭐ If this is useful

- **Star the repo** — the cheapest signal that helps the project find more builders
- **Fork it** — clone it, run it, rip out what you do not need, ship your version
- **Open issues** — bug reports, feature requests, architectural feedback all welcome
- **Send PRs** — see the Contributing section below
- **Share it** — if you build something on top, link back so others can find your work

## Quick start

You will need: [Bun](https://bun.sh) and either (a) an API key from at least one of the supported AI providers, or (b) Ollama / the bundled local provider if you want to stay fully offline.

```bash
git clone https://github.com/hallelx2/notebooklm-web.git
cd notebooklm-web
bun install
```

### Desktop (recommended for trying it locally)

Native Electron shell with embedded PGlite, local-FS storage, Kokoro TTS, and local embeddings all running in-process. Zero external dependencies.

```bash
bun --filter @notebooklm/desktop dev
```

That spawns Vite on `http://localhost:5173` and an Electron window pointed at it. First launch generates per-install encryption keys at `~/.notebooklm/config.json`, creates the PGlite data dir, and walks you through onboarding (chat provider + embedding provider — the bundled local provider needs no key). See [`apps/desktop/README.md`](apps/desktop/README.md) for keyboard shortcuts, data layout, and the SearxNG auto-start story.

**Prefer prebuilt installers?** Grab them from [the latest release](https://github.com/hallelx2/notebooklm-web/releases/latest) — Windows `.exe`, macOS `.dmg` (arm64), Linux `.deb` and `.AppImage`.

### Web

Hosted Next.js app, Neon Postgres, S3-compatible storage. Same workbench, same retrieval, same studio kinds.

```bash
cp apps/web/.env.example apps/web/.env       # fill in DATABASE_URL, AUTH_SECRET, MASTER_KEY_V1
bun --filter @notebooklm/web db:push         # push the Drizzle schema + create pgvector extension
bun --filter @notebooklm/web db:hnsw         # create HNSW indexes on the embedding sibling tables
bun --filter @notebooklm/web dev             # http://localhost:3000
```

First-time signup walks you through picking a chat provider and an embedding provider in `/settings`. Drop in your API keys, pick your models, and start building notebooks.

## Stack

| Layer | Tool | Notes |
|---|---|---|
| Monorepo | **Bun workspaces** | `apps/{web,desktop}` + `packages/{core,server,ui}` |
| Web framework | **Next.js 16** | App Router, Route Handlers for streaming, Server Components |
| Desktop shell | **Electron 33** | Single-instance lock, utility processes for ONNX, electron-builder installers |
| Server | **Hono** | Single Hono app mounted by Next.js (web) and Vite middleware (desktop dev) / esbuild bundle (desktop prod) |
| RPC | **tRPC v11** | Notebooks, sources, studio, providers, AI config |
| Auth | **Better Auth** | Sessions, OAuth, email/password |
| Database | **Drizzle + Neon Postgres** (web) / **PGlite** (desktop) | Same schema, swappable behind `PlatformAdapter` |
| Vectors | **pgvector** × 5 sibling tables | 384 / 768 / 1024 / 1536 / 3072 dim, HNSW cosine indexes |
| AI Layer | **AI SDK v6** | Uniform `LanguageModel` interface across 13 providers |
| TTS | **Deepgram Aura** (web) / **Kokoro local in utility process** (desktop) | Orion + Asteria voices, MP3 output, fully offline on desktop |
| Embeddings | Provider-chosen or **bundled local** (`@huggingface/transformers` sentence-transformer in utility process) | Zero-credential local fallback |
| Web search | **Exa + Tavily + SearxNG** | Two paid APIs and one OSS fallback. Pluggable order via `SEARCH_PROVIDER_ORDER`; desktop auto-starts SearxNG via Docker if available. |
| Web extract | **@mozilla/readability** + `%PDF` magic-byte sniffing | Routes PDF URLs to `unpdf` (pdfjs) so academic CDNs work |
| PDF parsing | **unpdf** | pdfjs-based, with `Promise.try` polyfill for Node 22 |
| Storage | **S3 / R2 / Supabase** (web) / **local-FS** (desktop) | Pluggable behind `StorageService` |
| Mind maps | **markmap-lib** | Markdown headings → interactive SVG, shift-click to chat about a node |
| UI | **React 19 + Tailwind v4** | Three-pane workbench, modal viewers per studio kind, vertical AppDock on desktop |

## Architecture at a glance

```
Renderer (web or desktop)             Hono server                          packages/core
                                                                                              
Workbench UI               →          /api/chat (streamText)        →      retrieve.ts         →   13 LLM providers
sources · chat · studio    →          /api/deep-research (SSE)      →      ingest/             →   Kokoro / Deepgram
                                      /api/studio/audio (SSE)       →      notebook-research/  →   PGlite / Neon
                                      tRPC: notebook · source ·     →      ai/factory          →       + pgvector ×5
                                            studio · provider ·            agent/runtimes/
                                            aiConfig · message
```

The same Hono app, tRPC routers, retrieval pipeline, and React components run in both apps. The web app mounts Hono via Next.js route handlers; the desktop app mounts it via Vite middleware in dev and an esbuild bundle in prod. Behaviour is identical because the only thing that differs is the `PlatformAdapter` (DB + storage + auth).

Read the **[whitepaper](docs/demo/NotebookLM-in-Four-Days-Whitepaper.pdf)** for the original four-day build's deep dive — sixteen chapters, ~45 pages, every decision explained. The whitepaper covers the pre-monorepo v0.1.x version; the current code has since moved into the workspace layout below.

## Project layout

```
apps/
  web/                            # Next.js 16 hosted app
    src/app/                      # App Router routes, Route Handlers wrap the Hono app
    .env.example
    drizzle.config.ts
  desktop/                        # Electron shell
    electron/                     # Main process, preload, menu, worker RPC factory
    src/                          # Renderer + TanStack Router + dev-mode Vite middleware
    scripts/                      # Build scripts (api-server bundle, icon, model fetch)
    build/                        # icon source + rendered assets

packages/
  core/                           # Pure logic, no Hono / no Next / no Electron
    src/
      retrieve.ts                 # Three-stage retrieval (expand → vector+keyword → rerank)
      notebook-research.ts        # v0.3.0 — six-phase studio research pipeline
      notebook-text.ts            # Full-doc source assembly + kind-aware summarisation
      ingest/                     # parse · chunk · embed · store
      agent/                      # Agent harness + runtimes (AI SDK adapter, prompts)
      ai/                         # Provider registry + per-user chat/embed factory
      tts/                        # Kokoro local + Deepgram adapters
      storage/                    # S3 / R2 / Supabase / local-FS adapters
      crypto/                     # AES-GCM encrypted credentials
      db/schema.ts                # Drizzle schema, fully portable across web/desktop
  server/                         # The Hono app + tRPC routers + handlers (chat, deep-research, studio, upload)
  ui/                             # Shared React components and views

docs/
  AGENT-HARNESS.md                # Technical vision for pluggable agent runtimes
  ACTIAN-INTEGRATION.md           # Alt-database integration notes
  demo/                           # Demo GIF, MP4, whitepaper PDF

docker/searxng/                   # Docker Compose stack for self-hosted SearxNG
```

## Configuration

### Web (`apps/web/.env`)

Minimum for local dev:

```bash
DATABASE_URL="postgres://..."             # Neon, Supabase, or any Postgres with pgvector
AUTH_SECRET="..."                          # 32+ random bytes; openssl rand -base64 32
MASTER_KEY_V1="..."                        # 32 bytes for AES-GCM credential encryption
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Optional but useful:

```bash
DEEPGRAM_API_KEY="..."                          # Required for audio overviews on web
EXA_API_KEY="..."                               # Paid; deep-research web search
TAVILY_API_KEY="..."                            # Paid; fallback web search
SEARXNG_URL="http://localhost:8080"             # OSS; self-hosted SearxNG instance
SEARCH_PROVIDER_ORDER="exa,tavily,searxng"      # Comma-separated priority order
SUPABASE_URL="..."                              # If using Supabase Storage
SUPABASE_SERVICE_ROLE_KEY="..."
S3_*                                            # If using S3 / R2 instead
```

### Desktop

Most env vars auto-generated on first launch and persisted to `~/.notebooklm/config.json` (mode 0600). See [`apps/desktop/README.md`](apps/desktop/README.md) for the full list — including `NOTEBOOKLM_DATA_DIR` (override the per-install dir), `NOTEBOOKLM_SEARXNG_AUTOSTART`, and `NOTEBOOKLM_ENABLE_CLAUDE_AGENT_SDK`.

User AI provider API keys are **not** environment variables — users add them through the in-app settings UI per-user, encrypted at rest with the per-install master key.

### Self-hosting SearxNG

SearxNG aggregates Google / Bing / DuckDuckGo / Wikipedia behind one JSON API and is the OSS option that lets users run deep-research without paid keys. A ready-to-run Docker setup lives at [`docker/searxng/`](docker/searxng/):

```bash
cd docker/searxng
export SEARXNG_PORT=8888
export SEARXNG_SECRET=$(openssl rand -hex 32)
docker compose up -d

# point the app at it
export SEARXNG_URL=http://localhost:${SEARXNG_PORT}
```

The desktop app **auto-starts the same compose stack on first launch** when Docker is available — no setup needed beyond installing Docker Desktop. See [`docker/searxng/README.md`](docker/searxng/README.md) for details, tear-down, and tuning.

Public instances (e.g. `https://searx.be`) work for testing but rate-limit unpredictably — self-host for production. Full SearxNG reference: <https://docs.searxng.org/admin/installation.html>

## Development

```bash
bun --filter @notebooklm/web dev            # Web app on http://localhost:3000
bun --filter @notebooklm/desktop dev        # Desktop app, Vite on :5173 + Electron window
bun --filter @notebooklm/web db:push        # Push Drizzle schema changes (web only — desktop uses stub-adapter)
bun --filter @notebooklm/web db:hnsw        # Create HNSW indexes (idempotent)
bun --filter @notebooklm/web db:reembed     # Backfill embeddings under a different model
bun --filter @notebooklm/web build          # Production build
bun --filter @notebooklm/desktop build      # Renderer only
bun --filter @notebooklm/desktop build:electron  # Full packaged binary -> apps/desktop/release/
bun run lint                                # Biome lint (workspace-wide)
bun run format                              # Biome format
bun run typecheck                           # tsc --noEmit per package
```

## Deploy

**Web** — built for [Vercel](https://vercel.com). Push to a connected GitHub repo, set env vars in the Vercel dashboard, deploy. Streaming routes use `maxDuration: 300` to fit deep-research and audio-generation runs comfortably under the function timeout. Self-hosting works anywhere Node 22+ runs — Docker, Render, Fly, your own VM. The only hard requirement is a Postgres with pgvector enabled.

**Desktop** — GitHub Actions `release-desktop` workflow triggers on tag pushes and produces installers for Windows (NSIS `.exe`), macOS (`.dmg` arm64), and Linux (`.deb` + `.AppImage`). Tag a release locally with `git tag v0.3.x && git push origin v0.3.x` and the workflow builds and attaches installers to the corresponding GitHub release. Auto-updates handled via `electron-updater` reading the `latest*.yml` manifests.

## What just shipped (v0.3.0, May 2026)

The most recent release is **v0.3.0 — Studio outputs that research before they write**. Every studio kind now generates from a citation-grounded research artifact via a six-phase pipeline (`recon → plan → retrieve → synthesize → reflect → augment → assemble`), cached per `(notebook fingerprint × chat model × user query)`, with live phase streaming into the panel.

Full per-version history is in [**CHANGELOG.md**](CHANGELOG.md). Each entry links to its GitHub release for full notes and installers.

## Roadmap

> **Companion documents:**
> - [`CHANGELOG.md`](CHANGELOG.md) — every release this project has shipped
> - [`ROADMAP.md`](ROADMAP.md) — phases ahead and what just landed
> - [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to land a useful PR
> - [`docs/AGENT-HARNESS.md`](docs/AGENT-HARNESS.md) — the technical vision for pluggable agent runtimes

**Recently delivered:**

- ✅ **Bun workspace migration** *(May 3, PR #1)* — Phase 1 done. Repo is now `apps/{web,desktop}` + `packages/{core,server,ui}`.
- ✅ **Local desktop app** *(v0.1.x → v0.2.x, May 5–8)* — Phase 2 done. Electron shell, PGlite embedded Postgres, Kokoro TTS + local embeddings in utility processes, SearxNG auto-start, installer pipelines for Win/macOS/Linux.
- ✅ **Notebook research pipeline for studio outputs** *(v0.3.0, May 11)* — Citation-grounded multi-phase research; partial delivery on the Phase 3 agent harness.

**What's next:** see [`ROADMAP.md`](ROADMAP.md) for the current phase plan. The remaining headline directions are the **pluggable agent harness** (Claude Agent SDK, OpenAI Agents SDK, Copilot Agent SDK runtimes selectable per task), **marketplace and extensions** (third-party studio kinds, source-kind plugins, MCP server mode), and **collaborative + mobile** surfaces.

## Contributing

Yes please. The contributions I am most excited to see now that the foundation has shipped:

- 🤖 **Agent harness adapters.** Claude Agent SDK, OpenAI Agents SDK, Copilot Agent SDK — sit alongside the AI SDK runtime in `packages/core/src/agent/runtimes/`, selectable per task. See [`docs/AGENT-HARNESS.md`](docs/AGENT-HARNESS.md).
- 🧠 **More local model integrations.** Better Ollama UX (auto-detect installed models, one-click pull). Native llama.cpp bindings. GGUF embedding adapters.
- 🗣️ **More local TTS adapters.** Piper, Coqui XTTS — same interface as the Kokoro adapter, drop-in for audio overviews.
- 🎨 **More studio output kinds.** One prompt file + one render function in `renderArtifactForKind`. Anki export, Mermaid diagrams, podcasts in other languages, custom report templates.
- 🔌 **More AI providers** (the registry is one file: `packages/core/src/ai/providers.ts`).
- 🔎 **More source kinds** — Notion, Drive, Linear, GitHub repos, RSS, email.
- 📐 **More embedding-dim sibling tables** (384/768/1024/1536/3072 today; 2048 and 4096 are interesting).
- 🌐 **More web-search providers** — Brave, Kagi, DuckDuckGo. Behind the same `SearchProvider` interface as Exa / Tavily / SearxNG.
- 🐛 **Bug fixes, docs, tests, accessibility improvements.**

For non-trivial changes — especially the agent harness and marketplace — open an issue first so we can talk through the shape before you spend hours on it. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the development workflow, commit conventions, and PR checklist.

## License

MIT. See [LICENSE](LICENSE). Use it, fork it, ship it, charge for it. If you build something cool, I would love to hear about it.

## Credits

Built by [Halleluyah Darasimi Oludele](https://github.com/hallelx2). The original web version landed in four days (2026-04-21 → 2026-04-24) and is documented in **Field Notes Issue 01** — the [45-page whitepaper](docs/demo/NotebookLM-in-Four-Days-Whitepaper.pdf) in this repo. Since then the project has shipped a Bun-workspace monorepo, a native Electron desktop app with offline-capable retrieval + TTS + embeddings, and a multi-phase notebook research pipeline driving every studio output (see [CHANGELOG.md](CHANGELOG.md)).

If this saved you a week, [say hi](mailto:halleluyaholudele@gmail.com) or follow on [GitHub](https://github.com/hallelx2).
