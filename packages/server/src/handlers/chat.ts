import { getChatModel, NoAiConfigError } from "@notebooklm/core/ai/factory";
import { messages, notebooks } from "@notebooklm/core/db/schema";
import { type RetrievedChunk, retrieveForQuery } from "@notebooklm/core/retrieve";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../adapter";

const Body = z.object({
  notebookId: z.string().uuid(),
  messages: z.array(z.any()),
  sourceIds: z.array(z.string().uuid()).optional(),
});

function formatSources(chunks: RetrievedChunk[]) {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.sourceTitle}\n${c.content}\n(chunk:${c.chunkId})`,
    )
    .join("\n\n---\n\n");
}

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

  let model: Awaited<ReturnType<typeof getChatModel>>;
  try {
    model = await getChatModel(session.user.id);
  } catch (err) {
    if (err instanceof NoAiConfigError) {
      return Response.json(
        { error: "NO_AI_CONFIG", role: err.role },
        { status: 412 },
      );
    }
    throw err;
  }

  const uiMessages = body.messages as UIMessage[];
  const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
  const query = lastUser
    ? (lastUser.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
    : "";

  let retrieved: RetrievedChunk[] = [];
  if (query) {
    try {
      retrieved = await retrieveForQuery({
        userId: session.user.id,
        notebookId: body.notebookId,
        query,
        sourceIds: body.sourceIds,
        topK: 12,
      });
    } catch (err) {
      if (err instanceof NoAiConfigError) {
        return Response.json(
          { error: "NO_AI_CONFIG", role: err.role },
          { status: 412 },
        );
      }
      throw err;
    }
  }

  await adapter.db.insert(messages).values({
    notebookId: body.notebookId,
    role: "user",
    content: query,
  });

  const systemPrompt = `You are a research assistant that answers strictly from the provided sources.
- Cite every non-trivial claim with [^n] markers where n is the source number below.
- If the sources don't contain the answer, say so — don't invent facts.
- Be concise and structured.

SOURCES:
${retrieved.length ? formatSources(retrieved) : "(no sources yet)"}`;

  const result = streamText({
    model,
    system: systemPrompt,
    messages: await convertToModelMessages(uiMessages),
    onFinish: async ({ text }) => {
      await adapter.db.insert(messages).values({
        notebookId: body.notebookId,
        role: "assistant",
        content: text,
        citations: retrieved.map((r, i) => ({
          n: i + 1,
          chunkId: r.chunkId,
          sourceId: r.sourceId,
          title: r.sourceTitle,
          snippet: r.content.slice(0, 240),
        })),
      });
    },
  });

  return result.toUIMessageStreamResponse();
}
