import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * SearxNG auto-start manager.
 *
 * On first launch, if Docker is available and SEARXNG_URL isn't already
 * configured, this provisions a per-install copy of `docker/searxng/`
 * into `<dataDir>/searxng/`, generates a random `SEARXNG_SECRET`, and
 * runs `docker compose up -d`. Once the container reports healthy on
 * `/healthz` we set `process.env.SEARXNG_URL` so the search provider
 * (`packages/core/src/search/searxng.ts`) picks it up the next time
 * `webSearch()` is invoked.
 *
 * Idempotent and non-blocking by design — call once from `getStubAdapter`
 * and let it complete in the background. The Hono server starts
 * immediately; deep-research will simply not have SearxNG available
 * for the few seconds it takes the container to come up.
 *
 * Three escape hatches:
 *   - `SEARXNG_URL` already set → respect the user's choice, do nothing.
 *   - `NOTEBOOKLM_SEARXNG_AUTOSTART=0` → opt out entirely.
 *   - `NOTEBOOKLM_SEARXNG_PORT=<n>` → override the host port (default 8888).
 */

const DEFAULT_PORT = 8888;
const READY_TIMEOUT_MS = 60_000;

export type SearxngStatus =
  | { state: "user-configured"; url: string }
  | { state: "already-running"; url: string }
  | { state: "auto-started"; url: string; configDir: string }
  | { state: "skipped"; reason: string };

/* ------------------------------------------------------------------ */
/*  Public                                                              */
/* ------------------------------------------------------------------ */

export async function ensureSearxng(dataDir: string): Promise<SearxngStatus> {
  if (process.env.SEARXNG_URL) {
    return { state: "user-configured", url: process.env.SEARXNG_URL };
  }
  if (process.env.NOTEBOOKLM_SEARXNG_AUTOSTART === "0") {
    return { state: "skipped", reason: "NOTEBOOKLM_SEARXNG_AUTOSTART=0" };
  }
  if (!isDockerAvailable()) {
    return {
      state: "skipped",
      reason:
        "docker not available — install Docker Desktop or set SEARXNG_URL to point at an existing instance",
    };
  }

  const port = resolvePort();
  const url = `http://localhost:${port}`;

  // Container already running from a previous session? Short-circuit so
  // we don't spend two seconds spinning up a no-op `docker compose up -d`.
  if (await isReady(url, 2000)) {
    process.env.SEARXNG_URL = url;
    return { state: "already-running", url };
  }

  const configDir = provisionConfigDir(dataDir);
  const secret = ensureSecret(configDir);

  await runComposeUp(configDir, port, secret);

  const ready = await waitForReady(url, READY_TIMEOUT_MS);
  if (!ready) {
    return {
      state: "skipped",
      reason: `searxng container started but /healthz not responding within ${READY_TIMEOUT_MS / 1000}s`,
    };
  }

  process.env.SEARXNG_URL = url;
  return { state: "auto-started", url, configDir };
}

/* ------------------------------------------------------------------ */
/*  Internals                                                          */
/* ------------------------------------------------------------------ */

function resolvePort(): number {
  const raw = process.env.NOTEBOOKLM_SEARXNG_PORT;
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_PORT;
  return Number.isFinite(n) && n > 0 && n < 65_536 ? n : DEFAULT_PORT;
}

function isDockerAvailable(): boolean {
  try {
    const r = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

async function isReady(url: string, timeoutMs: number): Promise<boolean> {
  try {
    const res = await fetch(`${url}/healthz`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForReady(url: string, totalMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < totalMs) {
    if (await isReady(url, 2000)) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/**
 * Locate the bundled `docker/searxng/` folder. In dev mode this resolves
 * relative to the source file. In a packaged production build, this
 * folder needs to be copied into the asar bundle (Phase 4c work — the
 * production server architecture isn't wired yet anyway).
 */
function bundledConfigDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // apps/desktop/src/server/ → up 4 → repo root, then docker/searxng/
  return resolve(here, "..", "..", "..", "..", "docker", "searxng");
}

function provisionConfigDir(dataDir: string): string {
  const target = join(dataDir, "searxng");
  if (!existsSync(target)) mkdirSync(target, { recursive: true });

  const bundled = bundledConfigDir();
  for (const file of ["docker-compose.yml", "settings.yml"]) {
    const src = join(bundled, file);
    const dst = join(target, file);
    // Only copy on first provision — never overwrite per-install edits.
    if (existsSync(src) && !existsSync(dst)) {
      copyFileSync(src, dst);
    }
  }
  return target;
}

/**
 * Persist the generated SEARXNG_SECRET in `<configDir>/.secret` so it
 * survives across container recreations. SearxNG needs a stable secret
 * for its session cookie signer; generating a fresh one each launch
 * would invalidate active sessions (not catastrophic, but pointless).
 */
function ensureSecret(configDir: string): string {
  const secretFile = join(configDir, ".secret");
  if (existsSync(secretFile)) {
    const existing = readFileSync(secretFile, "utf8").trim();
    if (existing.length >= 32) return existing;
  }
  const fresh = randomBytes(32).toString("hex");
  writeFileSync(secretFile, fresh, { mode: 0o600 });
  return fresh;
}

function runComposeUp(
  configDir: string,
  port: number,
  secret: string,
): Promise<void> {
  return new Promise((resolveFn, rejectFn) => {
    const child = spawn("docker", ["compose", "up", "-d"], {
      cwd: configDir,
      env: {
        ...process.env,
        SEARXNG_PORT: String(port),
        SEARXNG_SECRET: secret,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => rejectFn(err));
    child.on("close", (code) => {
      if (code === 0) {
        resolveFn();
      } else {
        rejectFn(
          new Error(
            `docker compose up exited ${code}${stderr ? `: ${stderr.trim()}` : ""}`,
          ),
        );
      }
    });
  });
}
