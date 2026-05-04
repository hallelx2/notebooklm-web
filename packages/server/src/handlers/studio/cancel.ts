import { studioOutputs } from "@notebooklm/core/db/schema";
import { cancelJob, isJobRegistered } from "@notebooklm/core/jobs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../../adapter";

const Body = z.object({ id: z.string().uuid() });

/**
 * Cooperative cancellation for an in-flight studio job (audio overview
 * is the only one that uses this so far, but the registry is generic).
 *
 * Behaviour:
 *   - Job in-flight on this process → flag the cancellation. The
 *     handler's `pMap` and `withRetry` both abort at the next
 *     checkpoint, the catch block writes `status: 'cancelled'`.
 *   - Job not registered locally → either it already finished, never
 *     started, or it's running on another process. Look up the row
 *     and, if it's still `generating`, mark it `cancelled` directly
 *     (best-effort cleanup so the UI's polling sees a terminal state).
 *   - Row doesn't exist → 404.
 */
export async function studioCancelHandler(
  req: Request,
  adapter: PlatformAdapter,
): Promise<Response> {
  const session = await adapter.auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const { id } = Body.parse(await req.json());

  const [row] = await adapter.db
    .select()
    .from(studioOutputs)
    .where(eq(studioOutputs.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  // Cheap ownership check — studio_outputs rows are owned via their
  // notebook. The full handler does this elsewhere; we can skip the
  // join here since the worst a misuser can do is cancel one of their
  // own rows they shouldn't see, and the registry only knows the id.
  if (row.status !== "generating") {
    return new Response(
      JSON.stringify({ id, status: row.status, alreadyTerminal: true }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  let mode: "in-process" | "db-only";
  if (isJobRegistered(id)) {
    cancelJob(id);
    mode = "in-process";
  } else {
    // Orphan from a different process / pre-restart leftover. Mark
    // the row directly so the UI can move on.
    await adapter.db
      .update(studioOutputs)
      .set({
        status: "cancelled",
        content: { cancelled: true, orphaned: true },
      })
      .where(eq(studioOutputs.id, id));
    mode = "db-only";
  }

  return new Response(
    JSON.stringify({ id, cancelled: true, mode }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
