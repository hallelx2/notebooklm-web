import { auth } from "@/lib/auth";
import { reembedAllUserSources } from "@/lib/ingest/reembed";

export const runtime = "nodejs";
export const maxDuration = 600;

/**
 * Streaming NDJSON endpoint. Re-embeds every source the user owns using
 * their currently-configured embedding model. The client subscribes to the
 * stream to show per-source progress.
 *
 * Mirrors the streaming pattern from /api/deep-research.
 */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const userId = session.user.id;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(payload: unknown) {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      }
      try {
        for await (const event of reembedAllUserSources(userId)) {
          send(event);
        }
      } catch (err) {
        send({
          type: "fatal",
          error: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
