# Changelog

All notable changes to `notebooklm-web` are documented here. Each entry links to its GitHub release for full notes, attached installers, and discussion.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and the [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

---

## [Unreleased]

Nothing landed on `main` yet beyond v0.3.0. Track the next direction in [`ROADMAP.md`](ROADMAP.md).

---

## [0.3.0] — 2026-05-11 · Studio outputs that research before they write

- Six-phase **notebook research pipeline** (`recon → plan → retrieve → synthesize → reflect → augment → assemble`) drives every studio kind: mind-map, briefing-doc, study-guide, FAQ, timeline, flashcards, quiz, audio overview.
- New `notebook_research_reports` table caches artifacts by `(notebook fingerprint × chat provider+model × user query)`. In-flight Map dedupes same-process requests; unique constraint catches multi-process races.
- `notebook-text` helper retires the 20 KB `sources.content` cap — full per-source text via `source_chunks` joined by ordinal, with kind-aware map-reduce summarisation when the full text doesn't fit the model context.
- Streaming phase events mirror into `studio_outputs.progress` (jsonb) and onto the audio SSE stream so the panel shows live progress through every stage.
- Per-kind artifact rendering preserves `(chunk:UUID)` citation markers for prose kinds, strips them for structured kinds and audio.
- `drizzle.config.ts` schema path repaired so `drizzle-kit push` works for the hosted app.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.3.0)

---

## [0.2.11] — 2026-05-08 · PDF ingestion that actually ingests

- `parseLink` sniffs the `%PDF` magic header and routes PDFs to `unpdf`, so arxiv / academic CDN URLs that serve PDFs with mismatched content-types stop spilling binary into the chunk index.
- **`Promise.try` polyfill** at the parse-module level. `unpdf@1.6.0` bundles a pdfjs build that needs Node 23+; on Node 22 LTS every PDF call was crashing the api-server.
- Duplicate `/api/upload` POST per file fixed. `uploadOne` lifted out of the `setPending` updater so React 19's double-invoked updaters don't fire the side effect twice.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.11)

---

## [0.2.10] — 2026-05-08 · Multi-source chat retrieval fix

- `ANY(${jsArray})` swapped for drizzle's `inArray()` so the planner sees `IN (...)` instead of a row tuple. Multi-source chat on PGlite now works (was throwing `[42809] op ANY/ALL (array) requires array on right side`).
- Postgres error reasons surface in the chat banner — `extractPgErrorReason` walks `error.cause`, unwraps drizzle's `Failed query: <SQL>` wrapper, and re-packs `[code] message -- detail (hint: …)` so users see something actionable instead of 768 floats of vector params.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.10)

---

## [0.2.9] — 2026-05-07 · Real pg reason on retrieval failure

- First pass at the error-unwrapping helper that v0.2.10 generalised. The chat banner started showing the actual postgres error code/message/detail instead of the drizzle wrapper.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.9)

---

## [0.2.8] — 2026-05-07 · Real DB error visible in chat banner

- `useChat` `error.cause` chain walked in the renderer; the banner now renders a collapsible technical-details section.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.8)

---

## [0.2.7] — 2026-05-07 · Chat duplicate submission + error surface

- Removed `externalPrompt` from the mobile `ChatPanel` mount so the desktop and mobile `useChat` instances stop submitting twice.
- Chat-error banner component introduced.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.7)

---

## [0.2.6] — 2026-05-07 · Mindmap click no longer hijacks expand

- `MindMapRenderer` requires `Shift+click` to send a node to chat; plain clicks are reserved for markmap's native expand/collapse. Capture-phase listener with `stopPropagation` so the two handlers don't race.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.6)

---

## [0.2.5] — 2026-05-07 · Dock placement swap + Save button overflow

- Vertical AppDock present on `/notebooks` (was missing) and absent on `/notebooks/[id]` (was overlapping the workbench).
- Settings popover Save button gets `min-w-0` + `shrink-0` so long-label flex children stop blowing out the row.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.5)

---

## [0.2.4] — 2026-05-07 · Drop side dock from `/notebooks`

- First iteration of the dock-placement work that v0.2.5 finalised (the swap direction got reversed).

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.4)

---

## [0.2.3] — 2026-05-07 · Dev-mode kokoro + embed workers

- `installDevWorkers()` Vite hook forks `tts-worker.cjs` and `embed-worker.cjs` via `child_process.fork` and publishes `globalThis.__notebooklm{Tts,Embed}Rpc`, so dev mode matches the prod `utilityProcess` topology.
- Dual-mode worker scripts detect `process.parentPort` (Electron) vs `process.send` (Node).

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.3)

---

## [0.2.2] — 2026-05-07 · Fix invisible gradient surfaces in light mode

- Design-system token fix for the second-pass surfaces (cards, panels, modals) that disappeared into the page background.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.2)

---

## [0.2.1] — 2026-05-07 · Light-mode contrast fixes

- Initial post-`v0.2.0` contrast pass — foreground tokens, border tokens, and accent-on-light combinations all adjusted.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.1)

---

## [0.2.0] — 2026-05-07 · Design system overhaul, universal dock, coding agents

- **Swappable design system** with the `saigon` and `render` packs — token-driven, runtime-switchable in `/settings/appearance`. Both packs ship light + dark variants. Landing pinned to `saigon`.
- Inter / Geist Sans / JetBrains Mono as the canonical font set, replacing Google Sans.
- **Universal vertical AppDock** as the desktop chrome on `/notebooks` and `/settings/*`. Named TanStack Router components (fixes React 19's "duplicated route" warnings).
- **Onboarding expanded** — 11 chat providers, 3 web-search providers, persisted test status.
- **Coding agents settings pane** scaffolded.
- Sidebar nav for settings with grouped sections + status dots.
- Brand mark redesigned to match the in-app `book_2` glyph; dark-mode logo fix.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.2.0)

---

## [0.1.24] — 2026-05-06 · Local embeddings in their own utility process

- Local sentence-transformer embeddings extracted into `embed-worker.cjs` so ONNX preprocessing stops pinning the main event loop. Shared worker-RPC factory used by both TTS and embed.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.24)

---

## [0.1.23] — 2026-05-06 · Kokoro TTS in a utility process

- Audio-overview generation no longer triggers Windows DWM "Not Responding" warnings. Kokoro runs in `tts-worker.cjs` and the api-server reaches it via `globalThis.__notebooklmTtsRpc`.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.23)

---

## [0.1.22] — 2026-05-06 · transformers.js env configured directly

- Configure `@huggingface/transformers` env on import (not via the `kokoro-js` wrapper) so the bundled model paths are honoured in packaged builds.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.22)

---

## [0.1.21] — 2026-05-06 · File logger, async `studio.generate`, kokoro diagnostics

- `desktop.log` file logger installed at boot so packaged-build errors are visible without a console window.
- `studio.generate` made non-blocking; UI polls instead of holding a request open.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.21)

---

## [0.1.20] — 2026-05-06 · Plain-string router search, devtools env override, update banner

- TanStack Router search params switched to plain strings (was breaking the desktop hash router).
- `NOTEBOOKLM_ENABLE_DEVTOOLS=1` opens devtools in packaged builds without shipping a debug installer.
- Update-available banner wired to electron-updater.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.20)

---

## [0.1.19] — 2026-05-06 · Four desktop fixes

- Router query-param parsing, prose markdown styles, autotitle race, bundled-kokoro asset path.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.19)

---

## [0.1.18] — 2026-05-06 · `.env` overrides in packaged builds

- Packaged desktop loads env overrides from `<DATA_DIR>/.env` so users can flip flags without rebuilding.
- Onboarding hash-router `?onboard=1` query parsing fix.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.18)

---

## [0.1.17] — 2026-05-06 · Same-origin renderer

- Renderer loaded from the embedded API server (`http://127.0.0.1:<port>`) instead of `file://`, so Better Auth's `SameSite=Lax` session cookies actually persist across the auth handshake.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.17)

---

## [0.1.16] — 2026-05-06 · Wait for session before redirect

- Sign-in / sign-up flows wait for the session to settle before navigating, eliminating the "you're back at the sign-in form even though sign-in succeeded" race.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.16)

---

## [0.1.15] — 2026-05-06 · Disable CSRF for file:// renderer

- Pre-`v0.1.17` workaround for the `file://`-rendered window. Superseded by the same-origin fix in v0.1.17.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.15)

---

## [0.1.14] — 2026-05-06 · Trust null + file:// origins

- Hono CORS config widened to accept `null` and `file://` request origins from the packaged renderer.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.14)

---

## [0.1.13] — 2026-05-06 · Embedded API server

- **First desktop release with an in-process Hono server.** esbuild bundles `apps/desktop/electron/api-server.entry.ts` → `dist-electron/api-server.cjs`, loaded by `main.cjs` on `app.whenReady`. Healthcheck + per-request timeout. trpc + Better Auth clients in the renderer point at the embedded URL exposed via the preload bridge.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.13)

---

## [0.1.12] — 2026-05-05 · Hash history for packaged build

- Packaged renderer uses TanStack Router's hash history so deep links resolve when loaded from `file://`.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.12)

---

## [0.1.11] — 2026-05-05 · Linux artifact name

- electron-builder Linux artifact filename cleaned (no more `@`-prefix in `.deb`).

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.11)

---

## [0.1.10] — 2026-05-05 · `.deb` homepage + Windows node-direct

- `.deb` `homepage` field populated; Windows installer invokes node directly to avoid PATH issues.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.10)

---

## [0.1.9] — 2026-05-05 · Strip root workspaces before electron-builder

- Workspaces stripped from the root `package.json` immediately before `electron-builder` so packaged builds don't try to resolve workspace symlinks.

[Full release notes →](https://github.com/hallelx2/notebooklm-web/releases/tag/v0.1.9)

---

## Earlier history

The original four-day web build (2026-04-21 → 2026-04-24) and pre-monorepo `v0.1.x` iterations through May 4 are documented in **Field Notes Issue 01** — the [45-page whitepaper](docs/demo/NotebookLM-in-Four-Days-Whitepaper.pdf) shipped in `docs/demo/`. The monorepo split into `apps/{web,desktop}` + `packages/{core,server,ui}` landed in [PR #1](https://github.com/hallelx2/notebooklm-web/pull/1) on 2026-05-03.
