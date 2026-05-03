import { createHNSWIndex } from "@notebooklm/core/db/migrate-hnsw";
import { createVectorIndexes } from "@notebooklm/core/db/migrate-vector-indexes";
import type { PlatformAdapter } from "../../adapter";

/**
 * Admin migration endpoint. Dispatches via `?step=` query param so the
 * maintainer can apply individual steps from a browser/curl after deploy.
 *
 *   ?step=hnsw      — legacy single-dim HNSW index (Phase < 1)
 *   ?step=vector    — create HNSW indexes for the new dim tables
 *   ?step=backfill  — copy legacy embeddings into chunk_embeddings_768
 *   ?step=all       — vector + backfill (typical Phase 1+2 cutover)
 */
export async function adminMigrateHandler(
  req: Request,
  adapter: PlatformAdapter,
): Promise<Response> {
  const session = await adapter.auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const step = url.searchParams.get("step") ?? "hnsw";

  const ran: string[] = [];

  if (step === "hnsw" || step === "all") {
    await createHNSWIndex(adapter.db);
    ran.push("hnsw (legacy)");
  }

  if (step === "vector" || step === "all") {
    await createVectorIndexes(adapter.db);
    ran.push("vector (per-dim HNSW)");
  }

  if (step === "backfill" || step === "all") {
    const { backfillLegacyEmbeddings } = await import(
      "@notebooklm/core/db/migrate-backfill-embeddings"
    );
    const stats = await backfillLegacyEmbeddings(adapter.db);
    ran.push(`backfill (${stats.copied} copied, ${stats.skipped} skipped)`);
  }

  if (ran.length === 0) {
    return Response.json(
      {
        ok: false,
        error: `Unknown step "${step}". Use one of: hnsw, vector, backfill, all`,
      },
      { status: 400 },
    );
  }

  return Response.json({ ok: true, ran });
}
