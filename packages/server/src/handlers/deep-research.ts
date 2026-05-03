import { runAgent } from "@notebooklm/core/agent";
import { NoAiConfigError } from "@notebooklm/core/ai/factory";
import { deepResearchRuns, notebooks, sources } from "@notebooklm/core/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../adapter";

/**
 * Deep research handler. The 9-phase orchestration (plan → search →
 * score → fetch → summarize → outline → write → reflect → augment →
 * verify) lives in the AI SDK runtime now (`runtimes/ai-sdk/index.ts
 * -> runResearch`); this handler is the NDJSON wire shim that:
 *
 *   1. Auths and validates.
 *   2. Inserts the `deep_research_runs` row.
 *   3. Translates the harness's structured event stream into the
 *      NDJSON event types the existing client (`useDeepResearch`) and
 *      the run-detail page already understand.
 *   4. Persists the final report as a notebook source and kicks off
 *      embedding in the background.
 *
 * Wire-format mapping is intentional: every `send(type, data)` the
 * pre-harness handler emitted maps to either a `step` (label-based) or
 * a `structured` (stage-discriminated payload) event from the runtime.
 * The mapping table below preserves byte-for-byte parity for the
 * client.
 */

const Body = z.object({
  notebookId: z.string().uuid(),
  query: z.string().min(3),
  mode: z.enum(["fast", "deep"]).default("deep"),
});

const STAGE_MESSAGES: Record<string, string> = {
  "existing-sources": "Checking notebook for existing sources...",
  plan: "Planning sub-questions",
  scoring: "Scoring source relevance...",
  "summarize-sources": "Extracting key information from sources...",
  synthesize: "Writing report...",
  reflection: "Analyzing gaps in coverage...",
  augmenting: "Adding new findings to report...",
  verification: "Cross-referencing claims...",
};

export async function deepResearchHandler(
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

  const [run] = await adapter.db
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

        let finalReport = "";
        let finalSources:
          | {
              n: number;
              url: string;
              title: string;
              snippet: string;
            }[]
          | undefined;

        for await (const ev of runAgent(
          {
            kind: "research",
            userId: session.user.id,
            notebookId: body.notebookId,
            query: body.query,
            mode: body.mode,
          },
          [{ id: "ai-sdk" }],
          { userId: session.user.id, signal: req.signal },
        )) {
          /* ── step: phase boundaries with human-readable messages ── */
          if (ev.type === "step") {
            const data = (ev.data ?? {}) as Record<string, unknown>;
            switch (ev.label) {
              case "search": {
                const count = (data.count as number) ?? 0;
                send("stage", {
                  stage: "search",
                  message: `Searching ${count} queries in parallel...`,
                });
                break;
              }
              case "fetch": {
                const from = data.from as number | undefined;
                const to = data.to as number | undefined;
                const total = data.total as number | undefined;
                send("stage", {
                  stage: "fetch",
                  message: `Reading sources ${from}-${to} of ${total}...`,
                });
                break;
              }
              case "writing-section": {
                send("stage", {
                  stage: "writing-section",
                  message: `Writing: ${data.heading}`,
                  section: data.section,
                  total: data.total,
                });
                break;
              }
              case "round-2": {
                send("stage", {
                  stage: "round-2",
                  message: `Filling ${data.gapCount} gaps...`,
                });
                break;
              }
              default: {
                const message = STAGE_MESSAGES[ev.label];
                if (message) send("stage", { stage: ev.label, message });
                else if (ev.label.startsWith("runtime:")) {
                  // harness "selected runtime" marker — not surfaced to client
                }
                break;
              }
            }
            continue;
          }

          /* ── structured: stage-discriminated payloads ── */
          if (ev.type === "structured") {
            const data = ev.data as Record<string, unknown>;
            const stage = data.stage as string | undefined;
            if (!stage) continue;
            const { stage: _drop, ...rest } = data as {
              stage: string;
              [k: string]: unknown;
            };
            switch (stage) {
              case "plan":
                send("plan", rest);
                await adapter.db
                  .update(deepResearchRuns)
                  .set({
                    plan: { subqueries: rest.subqueries },
                    updatedAt: new Date(),
                  })
                  .where(eq(deepResearchRuns.id, run.id));
                break;
              case "final-sources":
                finalSources = rest.sources as typeof finalSources;
                break;
              default:
                send(stage, rest);
                break;
            }
            continue;
          }

          /* ── text-delta: streaming the report body ── */
          if (ev.type === "text-delta") {
            send("report-delta", ev.text);
            finalReport += ev.text;
            continue;
          }

          /* ── error: surfaced as wire error ── */
          if (ev.type === "error") {
            send("error", { message: ev.message });
            await adapter.db
              .update(deepResearchRuns)
              .set({
                status: "error",
                error: ev.message,
                updatedAt: new Date(),
              })
              .where(eq(deepResearchRuns.id, run.id));
            controller.close();
            return;
          }

          /* ── done: finalize ── */
          if (ev.type === "done") {
            const obj = (ev.finalObject ?? {}) as {
              report?: string;
              sources?: NonNullable<typeof finalSources>;
            };
            const report =
              obj.report ?? ev.finalText ?? finalReport;
            const sourcesList = obj.sources ?? finalSources ?? [];

            await adapter.db
              .update(deepResearchRuns)
              .set({
                report,
                sources: sourcesList,
                status: "done",
                updatedAt: new Date(),
              })
              .where(eq(deepResearchRuns.id, run.id));

            if (report) {
              try {
                const [reportSource] = await adapter.db
                  .insert(sources)
                  .values({
                    notebookId: body.notebookId,
                    kind: "text",
                    title: `Research: ${body.query.slice(0, 80)}`,
                    content: report.slice(0, 20000),
                    status: "pending",
                  })
                  .returning();

                send("source-created", {
                  sourceId: reportSource.id,
                  title: reportSource.title,
                });

                // Background embed — never blocks the SSE.
                const { ingestText } = await import(
                  "@notebooklm/core/ingest/text"
                );
                ingestText({
                  userId: session.user.id,
                  sourceId: reportSource.id,
                  notebookId: body.notebookId,
                  text: report,
                  sourceTitle: reportSource.title,
                }).catch((err: unknown) => {
                  console.error("Failed to embed research report:", err);
                });
              } catch (err) {
                console.error(
                  "Failed to save research report as source:",
                  err,
                );
              }
            }

            send("done", {
              runId: run.id,
              report,
              sources: sourcesList,
            });
            continue;
          }
        }
      } catch (err) {
        if (err instanceof NoAiConfigError) {
          // Surfaced inside the stream so the client can show the
          // onboarding prompt — pre-harness sent HTTP 412 before
          // streaming, but the agent-level call only knows after the
          // first model touch, by which point we've already started
          // SSE. Match the chat handler's "in-stream error" pattern.
          send("error", {
            message: `NO_AI_CONFIG:${err.role}`,
            code: "NO_AI_CONFIG",
            role: err.role,
          });
          await adapter.db
            .update(deepResearchRuns)
            .set({
              status: "error",
              error: "NO_AI_CONFIG",
              updatedAt: new Date(),
            })
            .where(eq(deepResearchRuns.id, run.id));
        } else {
          const message = err instanceof Error ? err.message : String(err);
          await adapter.db
            .update(deepResearchRuns)
            .set({ status: "error", error: message, updatedAt: new Date() })
            .where(eq(deepResearchRuns.id, run.id));
          send("error", { message });
        }
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
