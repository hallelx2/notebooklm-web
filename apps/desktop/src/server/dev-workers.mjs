/**
 * Dev-mode worker bridge for kokoro TTS + sentence-transformer
 * embeddings.
 *
 * In production the Electron main process forks both workers via
 * `utilityProcess.fork` and publishes their RPCs to globalThis so the
 * api-server bundle (which Electron `require()`s into the same V8
 * isolate) can pick them up. In dev the api-server runs INSIDE Vite's
 * Node process — a separate process from Electron main — so those
 * globalThis hooks aren't visible. The kokoro-local provider then
 * falls back to inline ONNX execution, which crashes on
 * Kokoro-82M-v1.0-ONNX model load on most setups.
 *
 * Fix: spin the workers up from inside Vite too, using
 * `child_process.fork` (the workers were updated to support both
 * Electron parentPort and Node IPC). The same globalThis hooks get
 * set in Vite's process, the in-process api-server reads them at
 * request time, and TTS / embedding requests route through the
 * worker the same way packaged builds do.
 *
 * Idempotent: calling installDevWorkers() twice in the same process
 * (Vite restarts, HMR config reloads) is a no-op after the first call.
 */

import { fork } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// apps/desktop/src/server/  →  apps/desktop/electron/
const electronDir = resolve(here, "..", "..", "electron");

const DEFAULT_TIMEOUT_MS = 300_000;
let installed = false;

/**
 * Spawn one worker via child_process.fork and return an `rpc(type,
 * payload, timeoutMs)` callable matching the production interface.
 * Lazy: the child isn't forked until the first call. Self-healing:
 * if the child exits, pending requests reject and the next call
 * respawns.
 */
function createWorkerRpc({ name, scriptPath, defaultTimeoutMs = DEFAULT_TIMEOUT_MS }) {
  /** @type {import('node:child_process').ChildProcess | null} */
  let worker = null;
  const pending = new Map();
  let nextId = 1;

  function ensureWorker() {
    if (worker) return worker;
    console.log(`[dev-workers] forking ${name} at ${scriptPath}`);
    worker = fork(scriptPath, [], {
      // Inherit stdio so worker logs land in the same Vite terminal
      // the user is already watching. Errors from the worker get
      // surfaced in real time without any extra plumbing.
      stdio: ["ignore", "inherit", "inherit", "ipc"],
      env: { ...process.env },
    });

    worker.on("message", (msg) => {
      if (!msg || typeof msg.id !== "number") return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || `${name} rpc failed`));
    });

    worker.on("exit", (code) => {
      console.warn(
        `[dev-workers] ${name} exited (code=${code}). Re-spawn on next request.`,
      );
      const oldPending = Array.from(pending.values());
      pending.clear();
      worker = null;
      for (const p of oldPending) {
        p.reject(new Error(`${name} exited with code ${code}`));
      }
    });

    return worker;
  }

  function rpc(type, payload, timeoutMs = defaultTimeoutMs) {
    return new Promise((resolve, reject) => {
      const w = ensureWorker();
      const id = nextId++;
      const timer = setTimeout(() => {
        if (pending.delete(id)) {
          reject(new Error(`${name} timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      w.send({ id, type, payload });
    });
  }

  return { rpc };
}

/**
 * Mount kokoro-tts + embed worker RPCs onto globalThis so the
 * in-process api-server picks them up at request time. Safe to call
 * repeatedly — only the first call wires anything up.
 */
export function installDevWorkers() {
  if (installed) return;
  installed = true;

  const ttsWorker = createWorkerRpc({
    name: "tts-worker",
    scriptPath: join(electronDir, "tts-worker.cjs"),
  });
  const embedWorker = createWorkerRpc({
    name: "embed-worker",
    scriptPath: join(electronDir, "embed-worker.cjs"),
  });

  globalThis.__notebooklmTtsRpc = ttsWorker.rpc;
  globalThis.__notebooklmEmbedRpc = embedWorker.rpc;

  console.log(
    "[dev-workers] tts + embed workers wired to globalThis — kokoro-local + sentence-transformer requests will route through child processes instead of inline ONNX",
  );
}
