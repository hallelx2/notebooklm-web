/**
 * AI SDK runtime — the default adapter the harness falls back to.
 *
 * Behaves identically to the pre-harness call sites (chat handler,
 * deep-research handler, studio router/audio-overview/quiz-summary,
 * autotitle helper, retrieve.ts rerank pipeline). Every prompt is a
 * verbatim port from `prompts/` so commit 3 can route those call sites
 * through `runAgent()` without changing wire output.
 *
 * Importing this module side-effect-registers the adapter with the
 * harness via `registerAdapter`. The `runtimes/index.ts` barrel pulls
 * us in so apps that import `@notebooklm/core/agent/runtimes` get the
 * default runtime "for free".
 */
import {
  convertToModelMessages,
  generateObject,
  generateText,
  streamText,
  type UIMessage,
} from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getChatModel } from "../../../ai/factory";
import { sources } from "../../../db/schema";
import { parseLink } from "../../../ingest/parse";
import { retrieveForQuery, type RetrievedChunk } from "../../../retrieve";
import { coreDb } from "../../../runtime";
import { webSearch } from "../../../search";
import { registerAdapter } from "../../harness";
import type {
  AgentAdapter,
  AgentContext,
  AgentEvent,
  AgentTask,
} from "../../types";
import { makeCitationStreamer } from "./hooks";
import {
  audioScriptPrompt,
  autoSummaryPrompt,
  autoSummarySystem,
  autoTitlePrompt,
  autoTitleSystem,
  chatSystemPrompt,
  expandQueryPrompt,
  quizSummaryPrompt,
  rerankPrompt,
  researchAugmentPrompt,
  researchFastPrompt,
  researchFastSystemPrompt,
  researchOutlinePrompt,
  researchPlanPrompt,
  researchReflectionPrompt,
  researchScorePrompt,
  researchSectionPrompt,
  researchSummarizePrompt,
  researchVerificationPrompt,
  studioPrompt,
} from "./prompts";

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

/**
 * Discriminated narrowing helpers. TypeScript's flow analysis won't
 * carry a `task.kind === "chat"` check across an `await` so each
 * sub-runner takes its own narrowed task type.
 */
type ChatTask = Extract<AgentTask, { kind: "chat" }>;
type RerankTask = Extract<AgentTask, { kind: "rerank" }>;
type ResearchTask = Extract<AgentTask, { kind: "research" }>;
type StudioTask = Extract<AgentTask, { kind: "studio" }>;

export const aiSdkAdapter: AgentAdapter = {
  id: "ai-sdk",

  /**
   * Always returns true. `getChatModel` will throw `NoAiConfigError`
   * if the user hasn't onboarded — that surfaces to the caller as a
   * normal error (handlers catch and return HTTP 412), which is the
   * same path the pre-harness code took. There's no point gating
   * `available()` on it because no other runtime can do better:
   * embedding/test-connection paths already bypass the harness.
   */
  async available(_ctx: AgentContext) {
    return true;
  },

  /** AI SDK can express every task kind. */
  supports(_task: AgentTask) {
    return true;
  },

  async *run(task: AgentTask, ctx: AgentContext): AsyncIterable<AgentEvent> {
    switch (task.kind) {
      case "chat":
        yield* runChat(task, ctx);
        return;
      case "rerank":
        yield* runRerank(task, ctx);
        return;
      case "research":
        yield* runResearch(task, ctx);
        return;
      case "studio":
        yield* runStudio(task, ctx);
        return;
    }
  },
};

registerAdapter(aiSdkAdapter);

/* ------------------------------------------------------------------ */
/*  chat                                                               */
/* ------------------------------------------------------------------ */

/**
 * Mirrors `packages/server/src/handlers/chat.ts`:
 *   1. Pull the latest user query out of the UI messages.
 *   2. Run `retrieveForQuery` against the user's notebook.
 *   3. Bake the retrieved chunks into the system prompt with `(chunk:UUID)`
 *      markers so the citation streamer can attribute every cite.
 *   4. `streamText` and yield `text-delta`s; emit a `citation` whenever a
 *      marker appears in the model's output.
 *   5. Yield `done` with the full assembled text so the handler can persist
 *      the assistant message.
 */
async function* runChat(
  task: ChatTask,
  ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const model = await getChatModel(task.userId);

  const lastUser = [...task.messages]
    .reverse()
    .find((m) => m.role === "user");
  const query = lastUser
    ? (lastUser.parts ?? [])
        .filter((p): p is { type: "text"; text: string } => p.type === "text")
        .map((p) => p.text)
        .join("\n")
    : "";

  let retrieved: RetrievedChunk[] = [];
  if (query) {
    yield { type: "step", label: "retrieve" };
    retrieved = await retrieveForQuery({
      userId: task.userId,
      notebookId: task.notebookId,
      query,
      sourceIds: task.sourceIds,
      topK: 12,
    });
    for (const r of retrieved) {
      yield {
        type: "citation",
        chunkId: r.chunkId,
        sourceId: r.sourceId,
        sourceTitle: r.sourceTitle,
      };
    }
  }

  yield { type: "step", label: "generate" };
  // `convertToModelMessages` is sync in v6 but the existing handler awaits it
  // for forward compatibility — match that.
  const modelMessages = await convertToModelMessages(
    task.messages as UIMessage[],
  );
  const result = streamText({
    model,
    system: chatSystemPrompt(retrieved),
    messages: modelMessages,
    abortSignal: ctx.signal,
  });

  // Watch for `(chunk:UUID)` markers in the streamed text. Pre-retrieved
  // chunks are already emitted as citation events above; this catches
  // anything the model echoes back inline if it cited.
  const citations = makeCitationStreamer(retrieved);

  let finalText = "";
  for await (const text of result.textStream) {
    finalText += text;
    yield { type: "text-delta", text };
    for (const ev of citations.feed(text)) yield ev;
  }

  yield { type: "done", finalText };
}

/* ------------------------------------------------------------------ */
/*  rerank (covers query expansion + LLM relevance scoring)             */
/* ------------------------------------------------------------------ */

/**
 * Per the plan, `kind: "rerank"` covers both phases of the
 * `retrieveForQuery` pipeline:
 *   - empty `candidates` → query expansion (returns alt phrasings)
 *   - non-empty           → LLM relevance scoring (returns sorted topK)
 *
 * Errors are caught and the original list returned, matching the
 * `try/catch` fallbacks in `expandQuery`/`rerankChunks`. NoAiConfig and
 * other system errors will propagate from `getChatModel`.
 */
async function* runRerank(
  task: RerankTask,
  _ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  if (task.candidates.length === 0) {
    yield* runExpand(task);
    return;
  }
  yield* runScore(task);
}

async function* runExpand(task: RerankTask): AsyncIterable<AgentEvent> {
  try {
    const model = await getChatModel(task.userId);
    const { object } = await generateObject({
      model,
      schema: z.object({
        queries: z.array(z.string()).min(1).max(4),
      }),
      prompt: expandQueryPrompt(task.query),
    });
    yield { type: "structured", data: { queries: object.queries } };
    yield { type: "done", finalObject: { queries: object.queries } };
  } catch {
    // Match `expandQuery`'s silent fallback to the original query.
    yield { type: "structured", data: { queries: [task.query] } };
    yield { type: "done", finalObject: { queries: [task.query] } };
  }
}

async function* runScore(task: RerankTask): AsyncIterable<AgentEvent> {
  const { candidates, topK } = task;
  if (candidates.length <= topK) {
    yield { type: "structured", data: { sorted: candidates } };
    yield { type: "done", finalObject: { sorted: candidates } };
    return;
  }

  try {
    const model = await getChatModel(task.userId);
    const { object } = await generateObject({
      model,
      schema: z.object({
        ranked: z.array(
          z.object({
            index: z.number(),
            relevance: z.number().min(0).max(10),
          }),
        ),
      }),
      prompt: rerankPrompt(task.query, candidates),
    });

    const scoreMap = new Map(
      object.ranked.map((r) => [r.index, r.relevance]),
    );
    const sorted = candidates
      .map((c, i) => ({ chunk: c, score: scoreMap.get(i) ?? 5 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((x) => x.chunk);

    yield { type: "structured", data: { sorted } };
    yield { type: "done", finalObject: { sorted } };
  } catch {
    // Match `rerankChunks`'s silent fallback to the original order.
    const fallback = candidates.slice(0, topK);
    yield { type: "structured", data: { sorted: fallback } };
    yield { type: "done", finalObject: { sorted: fallback } };
  }
}

/* ------------------------------------------------------------------ */
/*  research (the 9-phase deep-research loop)                           */
/* ------------------------------------------------------------------ */

type FetchedSource = {
  url: string;
  title: string;
  snippet: string;
  text: string;
  summary?: string;
};

/**
 * Verbatim port of the orchestration in
 * `packages/server/src/handlers/deep-research.ts`. Every `send(type, data)`
 * becomes a `yield`. The handler still owns:
 *   - `deepResearchRuns` row creation/update
 *   - saving the report as a notebook source at the end
 * so the adapter focuses purely on LLM orchestration.
 *
 * Each phase emits a `step` boundary, optionally followed by `structured`
 * events with the phase output (plan, scores, fetched URLs, outline, etc).
 * Streamed report text is yielded as `text-delta`s. Final `done` carries
 * the assembled report and the consolidated source list.
 */
async function* runResearch(
  task: ResearchTask,
  _ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const { query, mode, notebookId, userId } = task;
  const isDeep = mode === "deep";
  const db = coreDb();
  const chatModel = await getChatModel(userId);

  /* ── Existing source awareness ─────────────────────────────── */
  let existingContext = "(no existing sources)";
  try {
    yield { type: "step", label: "existing-sources" };
    const existingSources = await db
      .select({ title: sources.title, content: sources.content })
      .from(sources)
      .where(
        and(
          eq(sources.notebookId, notebookId),
          eq(sources.status, "ready"),
        ),
      );
    yield {
      type: "structured",
      data: { stage: "existing-sources", count: existingSources.length },
    };
    existingContext =
      existingSources
        .filter((s) => s.content)
        .map((s) => `- ${s.title}: ${s.content!.slice(0, 500)}`)
        .join("\n")
        .slice(0, 3000) || "(no existing sources)";
  } catch (err) {
    console.error("Failed to load existing sources:", err);
  }

  /* ── Phase 1: plan sub-questions ───────────────────────────── */
  yield { type: "step", label: "plan" };
  const numSub = isDeep ? 5 : 3;
  const { object: plan } = await generateObject({
    model: chatModel,
    schema: z.object({
      subqueries: z.array(z.string().min(3)).min(2).max(8),
    }),
    prompt: researchPlanPrompt({ query, numSub, existingContext }),
  });
  const subqueries = plan.subqueries.slice(0, numSub);
  yield { type: "structured", data: { stage: "plan", subqueries } };

  /* ── Phase 2: parallel search ──────────────────────────────── */
  const perQuery = isDeep ? 6 : 4;
  const urlToResult = new Map<
    string,
    { url: string; title: string; snippet: string }
  >();

  yield {
    type: "step",
    label: "search",
    data: { count: subqueries.length },
  };
  const searchResults = await Promise.allSettled(
    subqueries.map((sub) => webSearch(sub, mode, perQuery)),
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
      yield {
        type: "structured",
        data: {
          stage: "search",
          subquery: subqueries[i],
          results: result.value,
        },
      };
    } else {
      yield {
        type: "structured",
        data: {
          stage: "search-error",
          subquery: subqueries[i],
          error:
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason),
        },
      };
    }
  }

  /* ── Phase 3: source quality scoring ───────────────────────── */
  let capped = Array.from(urlToResult.values());
  const maxSources = isDeep ? 14 : 8;
  if (capped.length > 0) {
    try {
      yield { type: "step", label: "scoring" };
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
        prompt: researchScorePrompt({ query, candidates: capped }),
      });
      const scoreMap = new Map(
        scored.ranked.map((r) => [r.url, r.relevanceScore]),
      );
      capped.sort(
        (a, b) => (scoreMap.get(b.url) ?? 5) - (scoreMap.get(a.url) ?? 5),
      );
      yield {
        type: "structured",
        data: {
          stage: "scored",
          ranked: scored.ranked
            .sort((a, b) => b.relevanceScore - a.relevanceScore)
            .slice(0, 5),
        },
      };
    } catch (err) {
      console.error("Source scoring failed, using original order:", err);
    }
  }
  capped = capped.slice(0, maxSources);

  /* ── Phase 4: parallel fetch + (deep) summarisation ────────── */
  const fetched: FetchedSource[] = [];
  const PARALLEL_FETCH = 4;
  const maxTextLen = isDeep ? 15000 : 6000;

  for (let i = 0; i < capped.length; i += PARALLEL_FETCH) {
    const batch = capped.slice(i, i + PARALLEL_FETCH);
    yield {
      type: "step",
      label: "fetch",
      data: {
        from: i + 1,
        to: Math.min(i + PARALLEL_FETCH, capped.length),
        total: capped.length,
      },
    };
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
        yield {
          type: "structured",
          data: {
            stage: "fetch",
            url: r.url,
            title: result.value.title ?? r.title,
            ok: true,
          },
        };
      } else {
        yield {
          type: "structured",
          data: {
            stage: "fetch",
            url: r.url,
            ok: false,
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
          },
        };
      }
    }
  }

  if (fetched.length === 0) {
    yield { type: "error", message: "No pages could be read." };
    return;
  }

  if (isDeep) {
    try {
      yield { type: "step", label: "summarize-sources" };
      const summaries = await Promise.allSettled(
        fetched.map(async (f) => {
          const { text } = await generateText({
            model: chatModel,
            prompt: researchSummarizePrompt({
              query,
              title: f.title,
              text: f.text,
            }),
          });
          return { ...f, summary: text };
        }),
      );
      for (const [i, result] of summaries.entries()) {
        if (result.status === "fulfilled") {
          fetched[i] = result.value;
          yield {
            type: "structured",
            data: {
              stage: "summarized",
              index: i,
              title: fetched[i].title,
            },
          };
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
  yield {
    type: "structured",
    data: { stage: "sources", sources: sourcesForClient },
  };

  /* ── Phase 5: report writing ───────────────────────────────── */
  yield { type: "step", label: "synthesize" };
  const sourcesBlock = fetched
    .map(
      (f, i) =>
        `[${i + 1}] ${f.title} (${f.url})\n${f.summary ?? f.text}`,
    )
    .join("\n\n---\n\n");

  let report = "";

  if (isDeep) {
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
      prompt: researchOutlinePrompt({ query, subqueries }),
    });

    yield {
      type: "structured",
      data: {
        stage: "outline",
        title: outline.title,
        sections: outline.sections.map((s) => s.heading),
      },
    };

    report = `# ${outline.title}\n\n`;
    yield { type: "text-delta", text: `# ${outline.title}\n\n` };

    for (const [i, section] of outline.sections.entries()) {
      yield {
        type: "step",
        label: "writing-section",
        data: {
          section: i + 1,
          total: outline.sections.length,
          heading: section.heading,
        },
      };
      const sectionResult = streamText({
        model: chatModel,
        prompt: researchSectionPrompt({
          query,
          heading: section.heading,
          keyPoints: section.keyPoints,
          sourcesBlock,
          isIntro: i === 0,
          isConclusion: i === outline.sections.length - 1,
        }),
      });

      const heading = `## ${section.heading}\n\n`;
      report += heading;
      yield { type: "text-delta", text: heading };

      for await (const chunk of sectionResult.textStream) {
        report += chunk;
        yield { type: "text-delta", text: chunk };
      }
      report += "\n\n";
      yield { type: "text-delta", text: "\n\n" };
    }
  } else {
    const fastResult = streamText({
      model: chatModel,
      system: researchFastSystemPrompt,
      prompt: researchFastPrompt({ query, subqueries, sourcesBlock }),
    });
    for await (const chunk of fastResult.textStream) {
      report += chunk;
      yield { type: "text-delta", text: chunk };
    }
  }

  /* ── Phase 6: reflection / multi-round (deep only) ─────────── */
  if (isDeep) {
    try {
      yield { type: "step", label: "reflection" };
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
        prompt: researchReflectionPrompt({ query, report }),
      });
      yield {
        type: "structured",
        data: {
          stage: "reflection",
          gaps: gaps.gaps,
          quality: gaps.overallQuality,
          assessment: gaps.assessment,
        },
      };

      if (gaps.gaps.length > 0 && gaps.overallQuality < 8) {
        yield {
          type: "step",
          label: "round-2",
          data: { gapCount: gaps.gaps.length },
        };
        const gapResults = await Promise.allSettled(
          gaps.gaps.map((g) => webSearch(g.searchQuery, "fast", 3)),
        );
        const newSources: FetchedSource[] = [];
        for (const result of gapResults) {
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
                  yield {
                    type: "structured",
                    data: {
                      stage: "fetch",
                      url: r.url,
                      title: parsed.title ?? r.title,
                      ok: true,
                      round: 2,
                    },
                  };
                } catch {
                  // skip failed fetches in round 2
                }
              }
            }
          }
        }

        if (newSources.length > 0) {
          yield { type: "step", label: "augmenting" };
          const newSourcesBlock = newSources
            .map(
              (f, idx) =>
                `[NEW-${idx + 1}] ${f.title} (${f.url})\n${f.text}`,
            )
            .join("\n\n---\n\n");
          const augmentResult = streamText({
            model: chatModel,
            prompt: researchAugmentPrompt({
              report,
              gapsBlock: gaps.gaps.map((g) => g.topic).join("; "),
              newSourcesBlock,
            }),
          });
          const additionalHeading = "\n## Additional Findings\n\n";
          report += additionalHeading;
          yield { type: "text-delta", text: additionalHeading };
          for await (const chunk of augmentResult.textStream) {
            report += chunk;
            yield { type: "text-delta", text: chunk };
          }
          for (const ns of newSources) fetched.push(ns);
        }
      }
    } catch (err) {
      console.error("Multi-round iteration failed:", err);
    }
  }

  /* ── Phase 7: verification (deep only) ─────────────────────── */
  if (isDeep) {
    try {
      yield { type: "step", label: "verification" };
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
        prompt: researchVerificationPrompt({
          report,
          sourcesIndex: fetched
            .map((f, i) => `[${i + 1}] ${f.title}`)
            .join(", "),
        }),
      });
      yield {
        type: "structured",
        data: {
          stage: "verification",
          claims: verification.verifiedClaims.length,
          highConfidence: verification.verifiedClaims.filter(
            (c) => c.confidence === "high",
          ).length,
          warnings: verification.warnings,
        },
      };
    } catch (err) {
      console.error("Fact verification failed:", err);
    }
  }

  /* ── Final ─────────────────────────────────────────────────── */
  const allSourcesForClient = fetched.map((f, i) => ({
    n: i + 1,
    url: f.url,
    title: f.title,
    snippet: f.snippet,
  }));
  yield {
    type: "structured",
    data: { stage: "final-sources", sources: allSourcesForClient },
  };
  yield {
    type: "done",
    finalText: report,
    finalObject: { report, sources: allSourcesForClient },
  };
}

/* ------------------------------------------------------------------ */
/*  studio                                                              */
/* ------------------------------------------------------------------ */

async function* runStudio(
  task: StudioTask,
  ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  switch (task.outputKind) {
    case "audio-script":
      yield* runAudioScript(task, ctx);
      return;
    case "quiz-summary":
      yield* runQuizSummary(task, ctx);
      return;
    case "auto-title":
      yield* runAutoTitle(task, ctx);
      return;
    default:
      yield* runStudioGeneric(task, ctx);
      return;
  }
}

/**
 * Generates the JSON podcast dialogue array. The audio-overview handler
 * keeps the TTS step (Deepgram is not an LLM) and persists the MP3.
 */
async function* runAudioScript(
  task: StudioTask,
  _ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const opts = task.opts ?? {};
  const sourceContent = opts.sourceContent;
  if (typeof sourceContent !== "string" || !sourceContent.trim()) {
    yield {
      type: "error",
      message: "audio-script requires opts.sourceContent",
    };
    return;
  }
  const length =
    opts.length === "short" || opts.length === "long" ? opts.length : "medium";
  const focus = typeof opts.focus === "string" ? opts.focus : undefined;

  const model = await getChatModel(task.userId);
  const result = streamText({
    model,
    prompt: audioScriptPrompt({ length, focus, sourceContent }),
  });
  let raw = "";
  for await (const text of result.textStream) {
    raw += text;
    yield { type: "text-delta", text };
  }
  yield { type: "done", finalText: raw };
}

/**
 * Grades the user's quiz answers locally, then asks the model for a
 * supportive markdown write-up. Mirrors `quiz-summary.ts`.
 */
async function* runQuizSummary(
  task: StudioTask,
  _ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const opts = task.opts ?? {};
  const questions = opts.questions as
    | { question: string; options: string[]; answer: number }[]
    | undefined;
  const answers = opts.answers as number[] | undefined;
  if (!Array.isArray(questions) || !Array.isArray(answers)) {
    yield {
      type: "error",
      message: "quiz-summary requires opts.questions and opts.answers",
    };
    return;
  }

  const results = questions.map((q, i) => {
    const selected = answers[i];
    const isCorrect = selected === q.answer;
    return {
      question: q.question,
      correctAnswer: q.options[q.answer],
      userAnswer:
        selected !== undefined ? q.options[selected] : "Not answered",
      isCorrect,
    };
  });
  const correct = results.filter((r) => r.isCorrect).length;
  const total = results.length;

  const model = await getChatModel(task.userId);
  const { text } = await generateText({
    model,
    prompt: quizSummaryPrompt({ results, correct, total }),
  });
  yield { type: "done", finalText: text };
}

/**
 * Best-effort title and/or description from a source excerpt. The
 * caller (autotitle.ts) is responsible for reading the notebook row,
 * deciding which fields are missing, and writing the result back. The
 * adapter just runs the LLM calls and yields a structured object.
 */
async function* runAutoTitle(
  task: StudioTask,
  _ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const opts = task.opts ?? {};
  const excerpt = typeof opts.excerpt === "string" ? opts.excerpt : "";
  if (!excerpt) {
    yield { type: "error", message: "auto-title requires opts.excerpt" };
    return;
  }

  // If the caller didn't say, generate both. The autotitle helper used
  // separate boolean gates per field; we honour them when present so
  // callers can avoid the second LLM call when only one is needed.
  const wantsTitle = opts.needsTitle !== false;
  const wantsDescription = opts.needsDescription !== false;

  const model = await getChatModel(task.userId);
  const result: { title?: string; description?: string } = {};

  if (wantsTitle) {
    try {
      const { text } = await generateText({
        model,
        system: autoTitleSystem,
        prompt: autoTitlePrompt(excerpt),
      });
      const title = text
        .split("\n")[0]
        .replace(/^["']|["']$/g, "")
        .replace(/\.$/, "")
        .trim()
        .slice(0, 80);
      if (title) result.title = title;
    } catch (err) {
      console.warn("auto-title failed", err);
    }
  }

  if (wantsDescription) {
    try {
      const { text } = await generateText({
        model,
        system: autoSummarySystem,
        prompt: autoSummaryPrompt(excerpt),
      });
      const description = text
        .replace(/^["']|["']$/g, "")
        .trim()
        .slice(0, 500);
      if (description) result.description = description;
    } catch (err) {
      console.warn("auto-summarize failed", err);
    }
  }

  yield { type: "structured", data: result };
  yield { type: "done", finalObject: result };
}

/**
 * Single-shot `generateText` for the simple studio kinds (mind-map,
 * study-guide, briefing-doc, faq, timeline, flashcards, quiz). The
 * caller decides whether to JSON-parse, fence-strip, or store as text —
 * we just return the raw model output.
 */
async function* runStudioGeneric(
  task: StudioTask,
  _ctx: AgentContext,
): AsyncIterable<AgentEvent> {
  const opts = task.opts ?? {};
  const sourceContent = opts.sourceContent;
  if (typeof sourceContent !== "string" || !sourceContent.trim()) {
    yield {
      type: "error",
      message: `studio:${task.outputKind} requires opts.sourceContent`,
    };
    return;
  }
  const questionCount =
    typeof opts.questionCount === "number" ? opts.questionCount : undefined;

  const model = await getChatModel(task.userId);
  const { text } = await generateText({
    model,
    prompt: studioPrompt(task.outputKind, sourceContent, { questionCount }),
  });
  yield { type: "done", finalText: text };
}
