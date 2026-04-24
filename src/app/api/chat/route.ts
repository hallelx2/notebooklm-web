import { google } from "@ai-sdk/google";
import { and, eq } from "drizzle-orm";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { messages, notebooks } from "@/db/schema";
import { auth } from "@/lib/auth";
import { retrieveForQuery, type RetrievedChunk } from "@/lib/retrieve";

export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const body = Body.parse(await req.json());
  const [nb] = await db
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
  const lastUser = [...uiMessages]
    .reverse()
    .find((m) => m.role === "user");
  const query = lastUser
    ? (lastUser.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
    : "";

  const retrieved = query
    ? await retrieveForQuery({
        notebookId: body.notebookId,
        query,
        sourceIds: body.sourceIds,
        topK: 12,
      })
    : [];

  await db.insert(messages).values({
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
    model: google("gemini-2.5-flash"),
    system: systemPrompt,
    messages: await convertToModelMessages(uiMessages),
    onFinish: async ({ text }) => {
      await db.insert(messages).values({
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
