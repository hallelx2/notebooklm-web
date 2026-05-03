# SearxNG for notebooklm-web

Self-hosted, open-source web-search backend. Powers `/api/deep-research` when neither Exa nor Tavily are configured. Single Docker container, MIT/AGPL stack, no API keys.

## Two ways to run it

### A) Manual (web app, server, anywhere with Docker)

```bash
cd docker/searxng

# Pick a port + generate a secret
export SEARXNG_PORT=8888
export SEARXNG_SECRET=$(openssl rand -hex 32)

docker compose up -d
```

Then point the app at the running instance:

```bash
# apps/web/.env or apps/desktop/.env
SEARXNG_URL=http://localhost:8888
```

The first `docker compose up` pulls the image (~150 MB) and starts the container; subsequent boots reuse it. Health check binds to `/healthz` so `docker ps` shows readiness.

### B) Auto-started by the desktop app

The desktop adapter (`apps/desktop/src/server/searxng-manager.ts`) runs once per Vite startup and:

1. **Skips** if `SEARXNG_URL` is already set, or if `NOTEBOOKLM_SEARXNG_AUTOSTART=0`.
2. **Skips with a log line** if Docker isn't on PATH or the daemon isn't reachable.
3. **Detects** if a healthy SearxNG container is already running on the expected port — if so, just sets `SEARXNG_URL` and returns.
4. **Provisions** a per-install copy of this folder at `<NOTEBOOKLM_DATA_DIR>/searxng/` (so per-install settings tweaks survive repo updates), generates a random `SEARXNG_SECRET`, and runs `docker compose up -d`.
5. **Waits** up to 60s for `/healthz`, then sets `process.env.SEARXNG_URL`.

The container persists across desktop app restarts deliberately — first launch is otherwise slow because of the image pull.

## Tearing down

```bash
# repo-level (manual mode)
cd docker/searxng && docker compose down

# desktop-level (auto-started)
cd ~/.notebooklm/searxng && docker compose down

# also remove the volume + cached image
docker compose down -v
docker image rm searxng/searxng:latest
```

## Updating

```bash
docker compose pull
docker compose up -d
```

## Tuning the engines

Edit `settings.yml` (in `docker/searxng/` for manual, or `<NOTEBOOKLM_DATA_DIR>/searxng/` for desktop auto-started). Each engine entry can be `disabled: true`, weighted, or replaced. Full reference: <https://docs.searxng.org/admin/settings/index.html>.

After editing:

```bash
docker compose restart
```

## Disabling auto-start on the desktop

Three ways:

```bash
# 1. Point at an existing instance (auto-start respects user override)
export SEARXNG_URL=https://my-self-hosted-searx.example.com

# 2. Hard-disable
export NOTEBOOKLM_SEARXNG_AUTOSTART=0

# 3. Use a non-default port
export NOTEBOOKLM_SEARXNG_PORT=9999
```

## Troubleshooting

**"docker compose up failed"** — usually means Docker daemon isn't running. On macOS / Windows, open Docker Desktop and wait for the green status. On Linux, `sudo systemctl start docker` (or add yourself to the `docker` group).

**Container starts but `/healthz` never responds** — check `docker compose logs searxng`. The most common cause is `SEARXNG_SECRET` being too short — the desktop manager generates 32 hex bytes which is fine, but if you set it manually, use 32+ random bytes.

**Provider returns no results** — verify `format=json` works:
```bash
curl -X POST -d 'q=test&format=json' http://localhost:8888/search | jq '.results | length'
```
If that returns `0` consistently, your engines might be rate-limited or blocked. Try editing `settings.yml` to enable a different engine set.
