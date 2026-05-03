/**
 * Lightweight runtime binding for db (and later: storage, search, env).
 *
 * Step 2 of the workspace migration uses this so packages/core can stay
 * portable without every existing function signature changing. Each app
 * calls `bindCoreRuntime({ db })` once at startup; core libraries read via
 * `coreDb()` inside functions (not at module load) so the binding happens
 * before first use.
 *
 * Step 3 replaces this with explicit adapter passing through tRPC ctx and
 * Hono handlers, at which point this shim can go away.
 */
import type { Database } from "./db";

export type CoreRuntime = {
  db: Database;
};

let runtime: CoreRuntime | null = null;

export function bindCoreRuntime(rt: CoreRuntime): void {
  runtime = rt;
}

export function coreRuntime(): CoreRuntime {
  if (!runtime) {
    throw new Error(
      "Core runtime not bound. Call bindCoreRuntime({ db }) at app startup before using core libraries.",
    );
  }
  return runtime;
}

export function coreDb(): Database {
  return coreRuntime().db;
}
