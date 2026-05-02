import { reembedAllUserSources } from "@notebooklm/core/ingest/reembed";
import type { PlatformAdapter } from "../adapter";

export async function reembedHandler(
  req: Request,
  adapter: PlatformAdapter,
): Promise<Response> {
  const session = await adapter.auth.api.getSession({ headers: req.headers });
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
