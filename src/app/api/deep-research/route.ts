import { generateObject, generateText, streamText } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { deepResearchRuns, notebooks, sources } from "@/db/schema";
import { getChatModel, NoAiConfigError } from "@/lib/ai/factory";
import { auth } from "@/lib/auth";
import { parseLink } from "@/lib/ingest/parse";
import { webSearch } from "@/lib/search";

export const runtime = "nodejs";
export const maxDuration = 300;

/* ------------------------------------------------------------------ */
/*  Types & schemas                                                    */
/* ------------------------------------------------------------------ */

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
  summary?: string;
};

/* ------------------------------------------------------------------ */
/*  POST handler                                                       */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const body = Body.parse(await req.json());
  const isDeep = body.mode === "deep";

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

  // Resolve the user's chat model once. All 9 LLM calls below share it.
  let chatModel: Awaited<ReturnType<typeof getChatModel>>;
  try {
    chatModel = await getChatModel(session.user.id);
  } catch (err) {
    if (err instanceof NoAiConfigError) {
      return Response.json(
        { error: "NO_AI_CONFIG", role: err.role },
        { status: 412 },
      );
    }
    throw err;
  }

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

        /* ============================================================
         * IMPROVEMENT 1 -- Existing Source Awareness
         * ============================================================ */
        let existingContext = "(no existing sources)";
        try {
          send("stage", {
            stage: "existing-sources",
            message: "Checking notebook for existing sources...",
          });

          const existingSources = await db
            .select({ title: sources.title, content: sources.content })
            .from(sources)
            .where(
              and(
                eq(sources.notebookId, body.notebookId),
                eq(sources.status, "ready"),
              ),
            );

          send("existing-sources", { count: existingSources.length });

          existingContext =
            existingSources
              .filter((s) => s.content)
              .map((s) => `- ${s.title}: ${s.content!.slice(0, 500)}`)
              .join("\n")
              .slice(0, 3000) || "(no existing sources)";
        } catch (err) {
          console.error("Failed to load existing sources:", err);
        }

        /* ============================================================
         * STEP 1 -- Plan sub-questions (with existing-source context)
         * ============================================================ */
        send("stage", { stage: "plan", message: "Planning sub-questions" });

        const numSub = isDeep ? 5 : 3;
        const { object: plan } = await generateObject({
          model: chatModel,
          schema: z.object({
            subqueries: z.array(z.string().min(3)).min(2).max(8),
          }),
          prompt: `You are planning a research brief. Break the user's question into ${numSub} focused, diverse sub-questions suitable for web search. No filler -- each sub-question should target a distinct angle, fact, or perspective.

The user already has these sources in their notebook:
${existingContext}

Avoid duplicating what they already know. Focus on NEW information and perspectives.

User question: ${body.query}`,
        });

        const subqueries = plan.subqueries.slice(0, numSub);
        send("plan", { subqueries });

        await db
          .update(deepResearchRuns)
          .set({ plan: { subqueries }, updatedAt: new Date() })
          .where(eq(deepResearchRuns.id, run.id));

        /* ============================================================
         * IMPROVEMENT 2 -- Parallel Search
         * ============================================================ */
        const perQuery = isDeep ? 6 : 4;
        const urlToResult = new Map<
          string,
          { url: string; title: string; snippet: string }
        >();

        send("stage", {
          stage: "search",
          message: `Searching ${subqueries.length} queries in parallel...`,
        });

        const searchResults = await Promise.allSettled(
          subqueries.map((sub) => webSearch(sub, body.mode, perQuery)),
        );

        for (const [i, result] of searchResults.entries()) {
          if (result.status === "fulfilled") {
            for (const r of result.value) {
              if (!urlToResult.has(r.url)) {
                urlToResult.set(r.url, {
                  url: r.url,
                  title: r.title,
                  snippet: r.snippet,
                });
              }
            }
            send("search", { subquery: subqueries[i], results: result.value });
          } else {
            send("search-error", {
              subquery: subqueries[i],
              error:
                result.reason instanceof Error
                  ? result.reason.message
                  : String(result.reason),
            });
          }
        }

        /* ============================================================
         * IMPROVEMENT 3 -- Source Quality Scoring
         * ============================================================ */
        let capped = Array.from(urlToResult.values());
        const maxSources = isDeep ? 14 : 8;

        if (capped.length > 0) {
          try {
            send("stage", {
              stage: "scoring",
              message: "Scoring source relevance...",
            });

            const { object: scored } = await generateObject({
              model: chatModel,
              schema: z.object({
                ranked: z.array(
                  z.object({
                    url: z.string(),
                    relevanceScore: z.number().min(1).max(10),
                    reason: z.string(),
                  }),
                ),
              }),
              prompt: `Rate each source's likely relevance to the research question "${body.query}" on a scale of 1-10.
Consider: domain authority, title relevance, snippet quality.

Sources:
${capped
  .map((r, i) => `${i + 1}. ${r.title} (${r.url})\n   Snippet: ${r.snippet}`)
  .join("\n\n")}

Return ALL sources ranked by relevance.`,
            });

            // Build a url-to-score map, then sort
            const scoreMap = new Map(
              scored.ranked.map((r) => [r.url, r.relevanceScore]),
            );
            capped.sort(
              (a, b) => (scoreMap.get(b.url) ?? 5) - (scoreMap.get(a.url) ?? 5),
            );

            send("scored", {
              ranked: scored.ranked
                .sort((a, b) => b.relevanceScore - a.relevanceScore)
                .slice(0, 5),
            });
          } catch (err) {
            console.error("Source scoring failed, using original order:", err);
          }
        }

        capped = capped.slice(0, maxSources);

        /* ============================================================
         * IMPROVEMENT 4 -- Parallel Fetch in Batches + LLM Summarization
         * ============================================================ */
        const fetched: FetchedSource[] = [];
        const PARALLEL_FETCH = 4;
        const maxTextLen = isDeep ? 15000 : 6000;

        for (let i = 0; i < capped.length; i += PARALLEL_FETCH) {
          const batch = capped.slice(i, i + PARALLEL_FETCH);
          send("stage", {
            stage: "fetch",
            message: `Reading sources ${i + 1}-${Math.min(i + PARALLEL_FETCH, capped.length)} of ${capped.length}...`,
          });

          const results = await Promise.allSettled(
            batch.map((r) => parseLink(r.url)),
          );

          for (const [j, result] of results.entries()) {
            const r = batch[j];
            if (result.status === "fulfilled") {
              fetched.push({
                url: r.url,
                title: result.value.title ?? r.title,
                snippet: r.snippet,
                text: result.value.text.slice(0, maxTextLen),
              });
              send("fetch", {
                url: r.url,
                title: result.value.title ?? r.title,
                ok: true,
              });
            } else {
              send("fetch", {
                url: r.url,
                ok: false,
                error:
                  result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason),
              });
            }
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

        // Deep mode: LLM summarization of each source
        if (isDeep) {
          try {
            send("stage", {
              stage: "summarize-sources",
              message: "Extracting key information from sources...",
            });

            const summaries = await Promise.allSettled(
              fetched.map(async (f) => {
                const { text } = await generateText({
                  model: chatModel,
                  prompt: `Extract the key facts, findings, and arguments from this text that are relevant to: "${body.query}"

Source: ${f.title}
Text: ${f.text}

Return a concise bullet-point summary of the most important information. Include specific data, numbers, dates, and findings.`,
                });
                return { ...f, summary: text };
              }),
            );

            for (const [i, result] of summaries.entries()) {
              if (result.status === "fulfilled") {
                fetched[i] = result.value;
                send("summarized", {
                  index: i,
                  title: fetched[i].title,
                });
              }
            }
          } catch (err) {
            console.error("Source summarization failed:", err);
          }
        }

        const sourcesForClient = fetched.map((f, i) => ({
          n: i + 1,
          url: f.url,
          title: f.title,
          snippet: f.snippet,
        }));
        send("sources", { sources: sourcesForClient });

        /* ============================================================
         * IMPROVEMENT 5 -- Report Writing
         * Deep: Section-by-section with outline
         * Fast: Single-pass streamed report
         * ============================================================ */
        send("stage", { stage: "synthesize", message: "Writing report..." });

        // Build the sources block: prefer summaries if available
        const sourcesBlock = fetched
          .map(
            (f, i) =>
              `[${i + 1}] ${f.title} (${f.url})\n${f.summary ?? f.text}`,
          )
          .join("\n\n---\n\n");

        let report = "";

        if (isDeep) {
          // ── Deep: outline → section-by-section writing ──────────
          const { object: outline } = await generateObject({
            model: chatModel,
            schema: z.object({
              title: z.string(),
              sections: z.array(
                z.object({
                  heading: z.string(),
                  keyPoints: z.array(z.string()),
                }),
              ),
            }),
            prompt: `Create an outline for a research report on: "${body.query}"

Sub-questions covered: ${subqueries.join("; ")}

The report should have 4-7 sections including an introduction and conclusion.
Each section should have 2-4 key points to address.`,
          });

          send("outline", {
            title: outline.title,
            sections: outline.sections.map((s) => s.heading),
          });

          report = `# ${outline.title}\n\n`;
          send("report-delta", `# ${outline.title}\n\n`);

          for (const [i, section] of outline.sections.entries()) {
            send("stage", {
              stage: "writing-section",
              message: `Writing: ${section.heading}`,
              section: i + 1,
              total: outline.sections.length,
            });

            const isIntro = i === 0;
            const isConclusion = i === outline.sections.length - 1;

            const sectionResult = streamText({
              model: chatModel,
              prompt: `You are writing section "${section.heading}" of a research report on "${body.query}".

Key points to cover: ${section.keyPoints.join("; ")}

SOURCES:
${sourcesBlock}

Write this section (200-400 words). Use inline citations [N] referring to the numbered sources. Be specific with facts and data. Use markdown formatting.

${isIntro ? "This is the introduction -- provide context and state the importance of the topic." : ""}
${isConclusion ? "This is the conclusion -- summarize key takeaways as bullet points." : ""}

Do NOT include the section heading -- it will be added automatically. Start directly with the content.`,
            });

            const heading = `## ${section.heading}\n\n`;
            report += heading;
            send("report-delta", heading);

            for await (const chunk of sectionResult.textStream) {
              report += chunk;
              send("report-delta", chunk);
            }
            report += "\n\n";
            send("report-delta", "\n\n");
          }
        } else {
          // ── Fast: single-pass streamed report ───────────────────
          const fastResult = streamText({
            model: chatModel,
            system:
              "You write thorough, well-structured research reports grounded strictly in the provided sources. Use inline citations like [1], [2] that refer to the numbered SOURCES list. Use clear section headings (## markdown). Do not invent facts; if sources disagree, note the disagreement. End with a 'Key takeaways' bullet list.",
            prompt: `Research question: ${body.query}\n\nSub-questions to cover:\n${subqueries
              .map((s, i) => `${i + 1}. ${s}`)
              .join(
                "\n",
              )}\n\nSOURCES:\n${sourcesBlock}\n\nWrite a concise report (500–800 words) answering the research question, with clear sections and inline [n] citations.`,
          });

          for await (const chunk of fastResult.textStream) {
            report += chunk;
            send("report-delta", chunk);
          }
        }

        /* ============================================================
         * IMPROVEMENT 6 -- Multi-Round Iteration (deep mode only)
         * ============================================================ */
        if (isDeep) {
          try {
            send("stage", {
              stage: "reflection",
              message: "Analyzing gaps in coverage...",
            });

            const { object: gaps } = await generateObject({
              model: chatModel,
              schema: z.object({
                gaps: z.array(
                  z.object({
                    topic: z.string(),
                    searchQuery: z.string(),
                  }),
                ),
                overallQuality: z.number().min(1).max(10),
                assessment: z.string(),
              }),
              prompt: `You just wrote this research report:

${report}

Research question: ${body.query}

Critically evaluate:
1. What important aspects of the question are NOT adequately covered?
2. Are there any claims that need more evidence?
3. What follow-up searches would strengthen this report?

Return 0-3 specific gaps that need additional research. If the report is comprehensive, return an empty gaps array.`,
            });

            send("reflection", {
              gaps: gaps.gaps,
              quality: gaps.overallQuality,
              assessment: gaps.assessment,
            });

            if (gaps.gaps.length > 0 && gaps.overallQuality < 8) {
              send("stage", {
                stage: "round-2",
                message: `Filling ${gaps.gaps.length} gaps...`,
              });

              // Search for gap topics in parallel
              const gapResults = await Promise.allSettled(
                gaps.gaps.map((g) => webSearch(g.searchQuery, "fast", 3)),
              );

              // Fetch and extract new sources
              const newSources: FetchedSource[] = [];
              for (const [i, result] of gapResults.entries()) {
                if (result.status === "fulfilled") {
                  for (const r of result.value) {
                    if (!urlToResult.has(r.url)) {
                      urlToResult.set(r.url, {
                        url: r.url,
                        title: r.title,
                        snippet: r.snippet,
                      });
                      try {
                        const parsed = await parseLink(r.url);
                        newSources.push({
                          url: r.url,
                          title: parsed.title ?? r.title,
                          snippet: r.snippet,
                          text: parsed.text.slice(0, 8000),
                        });
                        send("fetch", {
                          url: r.url,
                          title: parsed.title ?? r.title,
                          ok: true,
                          round: 2,
                        });
                      } catch {
                        // skip failed fetches in round 2
                      }
                    }
                  }
                }
              }

              if (newSources.length > 0) {
                send("stage", {
                  stage: "augmenting",
                  message: "Adding new findings to report...",
                });

                const newSourcesBlock = newSources
                  .map(
                    (f, idx) =>
                      `[NEW-${idx + 1}] ${f.title} (${f.url})\n${f.text}`,
                  )
                  .join("\n\n---\n\n");

                const augmentResult = streamText({
                  model: chatModel,
                  prompt: `You previously wrote this research report:

${report}

New sources have been found to fill these gaps: ${gaps.gaps.map((g) => g.topic).join("; ")}

NEW SOURCES:
${newSourcesBlock}

Write ADDITIONAL sections or paragraphs to address the gaps. Use citations [NEW-N] for new sources. Use markdown ## headings.`,
                });

                const additionalHeading = "\n## Additional Findings\n\n";
                report += additionalHeading;
                send("report-delta", additionalHeading);

                for await (const chunk of augmentResult.textStream) {
                  report += chunk;
                  send("report-delta", chunk);
                }

                // Merge new sources into the main list for the client
                for (const ns of newSources) {
                  fetched.push(ns);
                }
              }
            }
          } catch (err) {
            console.error("Multi-round iteration failed:", err);
          }
        }

        /* ============================================================
         * IMPROVEMENT 7 -- Fact Cross-Referencing (deep mode only)
         * ============================================================ */
        if (isDeep) {
          try {
            send("stage", {
              stage: "verification",
              message: "Cross-referencing claims...",
            });

            const { object: verification } = await generateObject({
              model: chatModel,
              schema: z.object({
                verifiedClaims: z.array(
                  z.object({
                    claim: z.string(),
                    supportedBy: z.array(z.number()),
                    confidence: z.enum(["high", "medium", "low"]),
                  }),
                ),
                warnings: z.array(z.string()),
              }),
              prompt: `Review this research report and identify the key factual claims. For each, note which source numbers support it.

Report:
${report}

Sources available: ${fetched.map((f, i) => `[${i + 1}] ${f.title}`).join(", ")}

Flag any claims supported by only one source as "low" confidence. Claims supported by 2+ sources are "high". Note any contradictions as warnings.`,
            });

            send("verification", {
              claims: verification.verifiedClaims.length,
              highConfidence: verification.verifiedClaims.filter(
                (c) => c.confidence === "high",
              ).length,
              warnings: verification.warnings,
            });
          } catch (err) {
            console.error("Fact verification failed:", err);
          }
        }

        /* ============================================================
         * Finalize -- Save to DB and create notebook source
         * ============================================================ */
        // Rebuild sourcesForClient with ALL sources (including round 2)
        const allSourcesForClient = fetched.map((f, i) => ({
          n: i + 1,
          url: f.url,
          title: f.title,
          snippet: f.snippet,
        }));

        await db
          .update(deepResearchRuns)
          .set({
            report,
            sources: allSourcesForClient,
            status: "done",
            updatedAt: new Date(),
          })
          .where(eq(deepResearchRuns.id, run.id));

        // Save the research report as a notebook source
        if (report) {
          try {
            const [reportSource] = await db
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

            // Run embedding in background (don't block the SSE stream)
            const { ingestText } = await import("@/lib/ingest/text");
            ingestText({
              userId: session.user.id,
              sourceId: reportSource.id,
              notebookId: body.notebookId,
              text: report,
              sourceTitle: reportSource.title,
            }).catch((err) => {
              console.error("Failed to embed research report:", err);
            });
          } catch (err) {
            console.error("Failed to save research report as source:", err);
          }
        }

        send("done", {
          runId: run.id,
          report,
          sources: allSourcesForClient,
        });
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
