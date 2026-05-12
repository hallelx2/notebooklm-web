# NotebookLM Desktop

Native shell around the same Hono server, tRPC routers, retrieval pipeline, and UI components the web app uses — but with **PGlite** in place of Neon Postgres, **local-FS storage** in place of S3/R2/Supabase, **Kokoro TTS** + **local sentence-transformer embeddings** in utility processes, and an embedded api-server bundled by esbuild. BYOK with any of 13 chat providers, or fully offline against [Ollama](https://ollama.com) or the bundled `local` embedding provider that needs no credentials.

For the per-release history (what landed in each `v0.1.x` → `v0.3.0` bump) see the root [`CHANGELOG.md`](../../CHANGELOG.md).

## Install a prebuilt binary

Grab the latest installer from [the GitHub releases page](https://github.com/hallelx2/notebooklm-web/releases/latest):

| Platform | Asset |
|---|---|
| Windows | `NotebookLM-Setup-<version>.exe` (NSIS) |
| macOS (Apple Silicon) | `NotebookLM-<version>-arm64.dmg` |
| Linux | `NotebookLM-<version>-amd64.deb` or `NotebookLM-<version>-x86_64.AppImage` |

The installers are currently **unsigned** — macOS will warn "developer cannot be verified" and Windows SmartScreen will prompt before letting you run them. Code signing + notarization is deferred (see Phase 5 in the [root ROADMAP](../../ROADMAP.md)). Auto-updates land via `electron-updater` reading the `latest*.yml` manifests on each release.

## Build from source

```bash
# from the repo root
bun install
bun --filter @notebooklm/desktop dev
```

That spawns Vite on `http://localhost:5173` and an Electron window pointed at it. First launch generates `~/.notebooklm/config.json` with a fresh per-install encryption key + auth secret, creates `~/.notebooklm/pglite/` (the embedded Postgres data dir), and walks you through onboarding (chat provider + embedding provider).

> **First-launch note**: Vite re-optimizes dependencies on the first run after a `bun install`, which can take 30–90s. The dev script gives `wait-on` a 3-minute window to handle this; on subsequent launches Vite is ready in ~2s.

> **`ELECTRON_RUN_AS_NODE` trap**: if your shell environment has this variable set (some agent runtimes / CI configs export it), Electron launches in plain-Node mode and `require("electron")` returns just the binary path — your main process crashes on `app.isPackaged`. Confirm with `echo %ELECTRON_RUN_AS_NODE%` (cmd) / `$env:ELECTRON_RUN_AS_NODE` (PowerShell) / `echo $ELECTRON_RUN_AS_NODE` (bash). Unset it before `bun --filter @notebooklm/desktop dev`.

## Keyboard shortcuts

| Action | macOS | Windows / Linux |
|---|---|---|
| New notebook | ⌘N | Ctrl+N |
| Settings | ⌘, | Ctrl+, (also under File menu) |
| Cut / Copy / Paste / Select-All / Undo / Redo | ⌘X / ⌘C / ⌘V / ⌘A / ⌘Z / ⌘⇧Z | Ctrl+ equivalents |
| Reload | ⌘R *(dev only)* | Ctrl+R *(dev only)* |
| Toggle DevTools | ⌥⌘I *(dev only)* | Ctrl+Shift+I *(dev only)* |
| Zoom In / Out / Reset | ⌘+ / ⌘− / ⌘0 | Ctrl+ / Ctrl− / Ctrl+0 |
| Fullscreen | ⌃⌘F | F11 |

The Edit-menu shortcuts use Electron's built-in roles, so they work in every text input without manual wiring.

## Data layout

Everything per-install lives under `<dataDir>` (default `~/.notebooklm`):

```
~/.notebooklm/
├── config.json           # encryption key + auth secret (mode 0600)
├── pglite/               # embedded Postgres data (PGlite)
├── storage/              # uploaded PDFs, generated audio, etc.
├── models/               # cached ONNX weights for the built-in local embedder
└── window-state.json     # last-used window position + size
```

Override the location:

```bash
NOTEBOOKLM_DATA_DIR=/path/to/somewhere bun --filter @notebooklm/desktop dev
```

Special value `NOTEBOOKLM_DATA_DIR=memory:` runs everything in-memory (PGlite memory mode + memory storage + per-launch random keys). Useful for smoke tests; nothing persists.

## Configuration

Most env vars are auto-generated on first launch and persisted to `config.json`. The ones you might want to set explicitly are documented in [`apps/desktop/.env.example`](.env.example):

- **`SEARXNG_URL`** — point at an existing SearxNG instance to skip the auto-start. Without this, the auto-start kicks in (see below).
- **`NOTEBOOKLM_SEARXNG_AUTOSTART=0`** — disable the auto-started container even when Docker is available.
- **`NOTEBOOKLM_SEARXNG_PORT=8888`** — host port for the auto-started container (default 8888).
- **`NOTEBOOKLM_ENABLE_CLAUDE_AGENT_SDK=1`** — opt into the Claude Agent SDK runtime for deep-research (requires an Anthropic credential saved via Settings → Providers). Without this flag, deep-research uses the AI SDK runtime against whatever provider you configured.

User AI provider keys (OpenAI, Anthropic, Google, Ollama, etc.) are added through the in-app settings UI per-user, encrypted at rest with the per-install key — same as the web app.

### SearxNG auto-start

Deep-research needs a web-search backend. If you don't have Exa or Tavily keys configured, the desktop adapter auto-starts a local SearxNG container on first launch — provided **Docker is installed and running**.

What the manager does (see `apps/desktop/src/server/searxng-manager.ts`):

1. Skips entirely if `SEARXNG_URL` is already set, or if `NOTEBOOKLM_SEARXNG_AUTOSTART=0`.
2. Detects Docker on PATH; logs a hint and skips if absent.
3. If a healthy container is already running on the expected port, just sets `SEARXNG_URL` and returns.
4. Otherwise: copies `docker/searxng/{docker-compose.yml,settings.yml}` to `<dataDir>/searxng/` (so per-install settings tweaks survive repo updates), generates a 32-byte `SEARXNG_SECRET` and persists it at `<dataDir>/searxng/.secret` (mode 0600), runs `docker compose up -d`, and waits up to 60s for `/healthz` before pointing the app at `http://localhost:<port>`.

The first launch is slow (~30s for image pull). Subsequent launches reuse the running container — log line `searxng reused at …`. The container deliberately persists across desktop restarts so the second launch is instant.

To fully tear down:

```bash
cd ~/.notebooklm/searxng
docker compose down -v
```

Configuration reference: [`docker/searxng/README.md`](../../docker/searxng/README.md).

## Custom app icon

`apps/desktop/build/icon.svg` is the source mark; `apps/desktop/build/icon.png` is the rendered 1024×1024 used by `electron-builder` to derive the macOS `.icns` and Windows `.ico` (Linux uses the PNG directly). To swap in a different logo:

1. Replace `apps/desktop/build/icon.svg` with your design.
2. Run `bun --filter @notebooklm/desktop build:icon` to re-render the PNG via `sharp`.
3. Commit both files. `electron-builder` picks them up on next `build:electron`.

## Build commands

```bash
bun --filter @notebooklm/desktop dev              # Vite + Electron, hot-reload
bun --filter @notebooklm/desktop dev:browser      # Vite only, in your browser (no Electron)
bun --filter @notebooklm/desktop build            # Renderer only -> apps/desktop/dist
bun --filter @notebooklm/desktop build:icon       # Re-render icon.png from icon.svg
bun --filter @notebooklm/desktop build:electron   # Full packaged binary -> apps/desktop/release/
bun --filter @notebooklm/desktop typecheck
```

The packaged binary is unsigned. macOS will show "developer cannot be verified"; Windows SmartScreen will prompt. Code signing + notarization is on the [Phase 5 deferred list](../../ROADMAP.md#phase-5--beyond-).

## Architecture

The desktop renderer is the same React tree as `apps/web` — same `@notebooklm/ui` components, same `@notebooklm/server` Hono app — wired together by:

- `apps/desktop/electron/main.cjs` — Electron main process. Single-instance lock, native chrome per platform, dev/prod URL switching, devtools gating, IPC for menu commands.
- `apps/desktop/electron/menu.cjs` — Application menu with platform-conventional roles + custom "New Notebook" / "Settings" commands that round-trip through the preload bridge.
- `apps/desktop/electron/preload.cjs` — `contextBridge` API exposing `window.notebooklm.onMenuCommand`. Sandbox + contextIsolation stay on; only this narrow surface is exposed.
- `apps/desktop/electron/window-state.cjs` — wraps `electron-window-state` against `<dataDir>` so window geometry sits next to PGlite and the rest of per-install state.
- `apps/desktop/vite.config.ts` — Vite plus a custom middleware that mounts the `@notebooklm/server` Hono app at `/api/*` for in-process API calls (no remote HTTP in dev).
- `apps/desktop/src/server/stub-adapter.ts` — `PlatformAdapter` impl backed by PGlite + `createLocalStorageProvider` + `createAuth` against the same Drizzle schema the web app uses.
