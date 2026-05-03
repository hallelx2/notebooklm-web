import { loadRuntimesForTask, runAgent } from "@notebooklm/core/agent";
import { NoAiConfigError } from "@notebooklm/core/ai/factory";
import { messages, notebooks } from "@notebooklm/core/db/schema";
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../adapter";

const Body = z.object({
  notebookId: z.string().uuid(),
  messages: z.array(z.any()),
  sourceIds: z.array(z.string().uuid()).optional(),
});

type Citation = {
  n: number;
  chunkId: string;
  sourceId: string;
  title: string;
  snippet: string;
};

/**
 * Chat handler. The LLM call + retrieval has moved into the AI SDK
 * runtime (`runtimes/ai-sdk/index.ts -> runChat`); this handler is now
 * a thin shim that:
 *   1. Auths and validates the request.
 *   2. Persists the user message.
 *   3. Builds an AI-SDK UIMessage stream from the harness's
 *      `text-delta` and `citation` events, so the existing client
 *      `useChat({ api: "/api/chat" })` integration keeps working.
 *   4. Persists the assistant message + citations on stream finish.
 */
export async function chatHandler(
  req: Request,
  adapter: PlatformAdapter,
): Promise<Response> {
  const session = await adapter.auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const body = Body.parse(await req.json());
  const [nb] = await adapter.db
    .select()
    .from(notebooks)
    .where(
      and(
        eq(notebooks.id, body.notebookId),
        eq(notebooks.userId, session.user.id),
      ),
    )
    .limit(1);
  if (!nb) return new Response("Notebook not found", { status: 404 });

  const uiMessages = body.messages as UIMessage[];
  const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
  const query = lastUser
    ? (lastUser.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
    : "";

  await adapter.db.insert(messages).values({
    notebookId: body.notebookId,
    role: "user",
    content: query,
  });

  // Resolve the user's runtime preference for chat. Defaults to
  // ["ai-sdk"] if they've never opened the runtime settings UI.
  const runtimes = await loadRuntimesForTask(session.user.id, "chat");

  // Collect citations + final text from the agent stream so we can
  // persist the assistant message after the UI stream finishes.
  const collectedCitations: Citation[] = [];
  let finalText = "";
  let citationCounter = 0;
  const seenCitations = new Set<string>();

  // Track if NoAiConfigError fired inside the stream — we can't swap
  // the response after starting it, so we surface as a stream `error`
  // chunk and let the client handle it the same as any other error.
  let noAiConfig: NoAiConfigError | null = null;

  const stream = createUIMessageStream({
    async execute({ writer }) {
      const messageId = `asst-${crypto.randomUUID()}`;
      const textId = `txt-${crypto.randomUUID()}`;

      writer.write({ type: "start", messageId });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textId });

      try {
        for await (const ev of runAgent(
          {
            kind: "chat",
            userId: session.user.id,
            notebookId: body.notebookId,
            messages: uiMessages,
            sourceIds: body.sourceIds,
          },
          runtimes,
          { userId: session.user.id, signal: req.signal },
        )) {
          if (ev.type === "text-delta") {
            finalText += ev.text;
            writer.write({ type: "text-delta", id: textId, delta: ev.text });
          } else if (ev.type === "citation") {
            if (!seenCitations.has(ev.chunkId)) {
              seenCitations.add(ev.chunkId);
              citationCounter += 1;
              collectedCitations.push({
                n: citationCounter,
                chunkId: ev.chunkId,
                sourceId: ev.sourceId,
                title: ev.sourceTitle,
                snippet: ev.snippet ?? "",
              });
            }
          } else if (ev.type === "error") {
            writer.write({ type: "error", errorText: ev.message });
          }
          // step / done events have no UI-message-chunk equivalent — skip
        }
      } catch (err) {
        if (err instanceof NoAiConfigError) {
          noAiConfig = err;
          writer.write({
            type: "error",
            errorText: `NO_AI_CONFIG:${err.role}`,
          });
        } else {
          writer.write({
            type: "error",
            errorText: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      writer.write({ type: "text-end", id: textId });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish" });
    },
    onError: (err) => (err instanceof Error ? err.message : String(err)),
    async onFinish() {
      // If onboarding wasn't done, skip persistence — the user never
      // saw the answer (the only chunks emitted were the error frame).
      if (noAiConfig || !finalText) return;
      await adapter.db.insert(messages).values({
        notebookId: body.notebookId,
        role: "assistant",
        content: finalText,
        citations: collectedCitations,
      });
    },
  });

  return createUIMessageStreamResponse({ stream });
}
