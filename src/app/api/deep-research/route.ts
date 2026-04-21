import { google } from "@ai-sdk/google";
import { and, eq } from "drizzle-orm";
import { generateObject, streamText } from "ai";
import { z } from "zod";
import { db } from "@/db";
import { deepResearchRuns, notebooks } from "@/db/schema";
import { auth } from "@/lib/auth";
import { parseLink } from "@/lib/ingest/parse";
import { webSearch } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  notebookId: z.string().uuid(),
  query: z.string().min(3),
  mode: z.enum(["fast", "deep"]).default("deep"),
});

type FetchedSource = {
  url: string;
  title: string;
  snippet: string;
  text: string;
};

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

  const [run] = await db
    .insert(deepResearchRuns)
    .values({
      notebookId: body.notebookId,
      query: body.query,
      mode: body.mode,
      status: "running",
    })
    .returning();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(type: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`${JSON.stringify({ type, data })}\n`),
        );
      }

      try {
        send("run", { id: run.id });

        // 1. Plan sub-questions
        send("stage", { stage: "plan", message: "Planning sub-questions" });
        const numSub = body.mode === "deep" ? 5 : 3;
        const { object: plan } = await generateObject({
          model: google("gemini-2.5-flash"),
          schema: z.object({
            subqueries: z.array(z.string().min(3)).min(2).max(8),
          }),
          prompt: `You are planning a research brief. Break the user's question into ${numSub} focused, diverse sub-questions suitable for web search. No filler — each sub-question should target a distinct angle, fact, or perspective.\n\nUser question: ${body.query}`,
        });
        const subqueries = plan.subqueries.slice(0, numSub);
        send("plan", { subqueries });
        await db
          .update(deepResearchRuns)
          .set({ plan: { subqueries }, updatedAt: new Date() })
          .where(eq(deepResearchRuns.id, run.id));

        // 2. Search each sub-query
        const perQuery = body.mode === "deep" ? 6 : 4;
        const urlToResult = new Map<
          string,
          { url: string; title: string; snippet: string }
        >();
        for (const sub of subqueries) {
          send("stage", { stage: "search", message: `Searching: ${sub}` });
          try {
            const results = await webSearch(sub, body.mode, perQuery);
            for (const r of results) {
              if (!urlToResult.has(r.url)) {
                urlToResult.set(r.url, {
                  url: r.url,
                  title: r.title,
                  snippet: r.snippet,
                });
              }
            }
            send("search", { subquery: sub, results });
          } catch (err) {
            send("search-error", {
              subquery: sub,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        const capped = Array.from(urlToResult.values()).slice(
          0,
          body.mode === "deep" ? 14 : 8,
        );

        // 3. Fetch & extract each page
        const fetched: FetchedSource[] = [];
        for (const r of capped) {
          send("stage", {
            stage: "fetch",
            message: `Reading ${new URL(r.url).hostname}`,
          });
          try {
            const parsed = await parseLink(r.url);
            fetched.push({
              url: r.url,
              title: parsed.title ?? r.title,
              snippet: r.snippet,
              text: parsed.text.slice(0, 6000),
            });
            send("fetch", { url: r.url, title: parsed.title ?? r.title, ok: true });
          } catch (err) {
            send("fetch", {
              url: r.url,
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }

        if (fetched.length === 0) {
          send("error", { message: "No pages could be read." });
          await db
            .update(deepResearchRuns)
            .set({
              status: "error",
              error: "No pages could be read",
              updatedAt: new Date(),
            })
            .where(eq(deepResearchRuns.id, run.id));
          controller.close();
          return;
        }

        const sourcesForClient = fetched.map((f, i) => ({
          n: i + 1,
          url: f.url,
          title: f.title,
          snippet: f.snippet,
        }));
        send("sources", { sources: sourcesForClient });

        // 4. Synthesize report
        send("stage", { stage: "synthesize", message: "Writing report" });
        const sourcesBlock = fetched
          .map(
            (f, i) => `[${i + 1}] ${f.title} (${f.url})\n${f.text}`,
          )
          .join("\n\n---\n\n");

        const result = streamText({
          model: google("gemini-2.5-flash"),
          system:
            "You write thorough, well-structured research reports grounded strictly in the provided sources. Use inline citations like [1], [2] that refer to the numbered SOURCES list. Use clear section headings (## markdown). Do not invent facts; if sources disagree, note the disagreement. End with a 'Key takeaways' bullet list.",
          prompt: `Research question: ${body.query}\n\nSub-questions to cover:\n${subqueries
            .map((s, i) => `${i + 1}. ${s}`)
            .join("\n")}\n\nSOURCES:\n${sourcesBlock}\n\nWrite a comprehensive report (800–1500 words) answering the research question, with clear sections and inline [n] citations.`,
        });

        let report = "";
        for await (const chunk of result.textStream) {
          report += chunk;
          send("report-delta", chunk);
        }

        await db
          .update(deepResearchRuns)
          .set({
            report,
            sources: sourcesForClient,
            status: "done",
            updatedAt: new Date(),
          })
          .where(eq(deepResearchRuns.id, run.id));

        send("done", { runId: run.id, report, sources: sourcesForClient });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(deepResearchRuns)
          .set({ status: "error", error: message, updatedAt: new Date() })
          .where(eq(deepResearchRuns.id, run.id));
        send("error", { message });
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
