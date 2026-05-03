/**
 * Schema-only db module. Each application constructs its own Drizzle client
 * (Neon HTTP for the web, PGlite for the desktop) and feeds the schema in.
 *
 * Routers and lib/* never import a `db` constant from here — they receive the
 * client through a PlatformAdapter (see packages/server) so the same code runs
 * unchanged across cloud Postgres and embedded Postgres.
 */
import * as schema from "./schema";

export { schema };
export * from "./schema";

/**
 * Database type generic enough to accept every Drizzle pg dialect we target
 * (neon-serverless, neon-http, pglite, node-postgres) yet specific enough
 * for `select()`, `insert()`, etc. to infer table column types from the
 * shared schema. Tightened per-adapter inside packages/server's
 * PlatformAdapter contract if a single-dialect lock-in is needed.
 */
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;
