import { neonConfig, Pool } from "@neondatabase/serverless";
import { bindCoreRuntime } from "@notebooklm/core/runtime";
import * as schema from "@notebooklm/core/db/schema";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

export type WebDatabase = NeonDatabase<typeof schema>;

let cached: WebDatabase | null = null;

function buildDb(): WebDatabase {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is required at runtime. Set it in apps/web/.env (local) " +
        "or in the Vercel project's env vars (Preview + Production).",
    );
  }
  const pool = new Pool({ connectionString: url });
  const instance = drizzle(pool, { schema });
  bindCoreRuntime({ db: instance });
  return instance;
}

/**
 * Lazy db handle. The first property access on `db` constructs the underlying
 * Neon-backed Drizzle client; later accesses return the same instance.
 *
 * Why lazy: Next.js's "Collect page data" build phase evaluates every route
 * module to read `runtime` / `maxDuration` / etc. exports. The catch-all at
 * `apps/web/src/app/api/[[...path]]/route.ts` imports `webAdapter` →
 * `db` transitively. If we threw at module load (the previous shape), every
 * `next build` on a deployment without DATABASE_URL — most notably Vercel
 * preview deployments where the env var may be Production-only — would fail
 * before serving a single request. Lazy-init defers the env-var assertion to
 * the first actual query, so builds succeed regardless of env scope and the
 * thrown error only surfaces when someone really tries to talk to Postgres
 * without configuring the connection.
 *
 * The Proxy binds methods to the instance so Drizzle's `this`-dependent
 * builders (`db.select()…`, `db.insert()…`) keep working.
 */
export const db = new Proxy({} as WebDatabase, {
  get(_target, prop, receiver) {
    if (!cached) cached = buildDb();
    const value = Reflect.get(cached as object, prop, receiver);
    return typeof value === "function" ? value.bind(cached) : value;
  },
});
