/**
 * Notebook research pipeline. Orchestrates a kind-agnostic deep
 * research pass over a notebook's sources, producing a citation-grounded
 * artifact that downstream studio kinds (mind-map, briefing-doc, FAQ,
 * etc.) generate from. Caches the artifact per
 * `(notebookFingerprint, chatProvider+model, normalizedUserQuery)` so
 * different studio kinds with the same scope share one research run; a
 * different query regenerates from scratch; any source change shifts
 * the fingerprint and invalidates everything.
 *
 * Pipeline phases (cache miss path):
 *   1. recon+plan (1 LLM call) — fused via a single generateObject
 *   2. retrieve  (no LLM)      — vector search per sub-question
 *   3. synthesize (N parallel) — Promise.allSettled, retry-with-smaller-k
 *   4. reflect   (1 LLM call)
 *   5. augment   (0–3 LLM calls)
 *   6. assemble  (no LLM)
 *
 * Single-call phases are wrapped in `withRetry` so a transient 5xx
 * doesn't kill the pipeline. Synthesis fan-out tolerates per-section
 * failure: a section that fails twice (once at top-K, once at half-K)
 * is preserved as a placeholder with `confidence: "low"` so kind prompts
 * see the gap rather than a silent drop.
 *
 * In-flight dedup: two studio kinds clicked back-to-back at the same
 * scope share one research run. The second caller awaits the first's
 * promise. Combined with a unique constraint on `cacheKey` for
 * multi-process safety.
 */
import { createHash } from "node:crypto";
import { generateObject, generateText, type LanguageModel } from "ai";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  notebookReconPlanPrompt,
  notebookReflectPrompt,
  notebookSynthesizePrompt,
} from "./agent/runtimes/ai-sdk/prompts";
import { getModel, isValidProviderId } from "./ai/providers";
import { withRetry } from "./concurrency";
import {
  notebookResearchReports,
  sourceChunks,
  sources,
  userAiConfig,
} from "./db/schema";
import {
  assembleStudioSourceContent,
  loadNotebookSourcesFullText,
} from "./notebook-text";
import { type RetrievedChunk, retrieveForQuery } from "./retrieve";
import { coreDb } from "./runtime";

const CHARS_PER_TOKEN = 4;
const DEFAULT_CONTEXT_WINDOW_TOKENS = 100_000;
const RECON_BUDGET_FRACTION = 0.4;
const MIN_SUBQUESTIONS = 4;
const MAX_SUBQUESTIONS = 12;
const TOPK_PER_SUBQUESTION = 16;
const TOPK_PER_SUBQUESTION_RETRY = 8;
const TOPK_PER_GAP = 8;
const SYNTH_BATCH_SIZE = 4;
const MAX_GAPS = 3;
const SNIPPET_LEN = 200;

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface ResearchArtifact {
  topic: string;
  scope: string;
  structuralOverview: string;
  subquestions: string[];
  sections: Array<{
    subquestion: string;
    content: string;
    chunkIds: string[];
    confidence: "high" | "low";
  }>;
  augmentations: Array<{
    gap: string;
    content: string;
    chunkIds: string[];
  }>;
  citationMap: Record<
    string,
    { sourceId: string; sourceTitle: string | null; snippet: string }
  >;
}

export type ResearchEvent =
  | { stage: "research:cache-hit"; message: string }
  | { stage: "research:embedding-pending"; message: string }
  | { stage: "research:no-sources"; message: string }
  | { stage: "research:recon-plan"; message: string }
  | {
      stage: "research:retrieve";
      message: string;
      current?: number;
      total?: number;
    }
  | {
      stage: "research:synthesize";
      message: string;
      current?: number;
      total?: number;
    }
  | { stage: "research:reflect"; message: string }
  | {
      stage: "research:augment";
      message: string;
      current?: number;
      total?: number;
    }
  | { stage: "research:assemble"; message: string };

export type ResearchFallback = "embedding-pending" | "no-sources" | null;

export interface RunNotebookResearchResult {
  artifact: ResearchArtifact | null;
  fromCache: boolean;
  fallback: ResearchFallback;
  totalLlmCalls: number;
  durationMs: number;
}

/* ------------------------------------------------------------------ */
/*  Fingerprint + cache key                                           */
/* ------------------------------------------------------------------ */

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Hashes `(sortedChunkIds, sumTokenCount, embeddingProvider, embeddingModel,
 * embeddingDim)`. Chunk UUIDs regenerate on re-ingest so identity-only
 * comparison catches content changes that a `count(*)` would miss.
 */
async function computeNotebookFingerprint(notebookId: string): Promise<string> {
  const db = coreDb();
  const rows = await db
    .select({
      chunkId: sourceChunks.id,
      tokenCount: sourceChunks.tokenCount,
      embeddingProvider: sourceChunks.embeddingProvider,
      embeddingModel: sourceChunks.embeddingModel,
      embeddingDim: sourceChunks.embeddingDim,
    })
    .from(sourceChunks)
    .innerJoin(sources, eq(sourceChunks.sourceId, sources.id))
    .where(
      and(eq(sourceChunks.notebookId, notebookId), eq(sources.status, "ready")),
    )
    .orderBy(asc(sourceChunks.id));

  return sha256(
    JSON.stringify({
      chunkIds: rows.map((r) => r.chunkId),
      sumTokens: rows.reduce((acc, r) => acc + (r.tokenCount ?? 0), 0),
      embeddingProvider: rows[0]?.embeddingProvider ?? null,
      embeddingModel: rows[0]?.embeddingModel ?? null,
      embeddingDim: rows[0]?.embeddingDim ?? null,
    }),
  );
}

function computeCacheKey(opts: {
  notebookFingerprint: string;
  chatProvider: string;
  chatModel: string;
  userQuery: string | null;
}): string {
  const normalized = (opts.userQuery ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return sha256(
    JSON.stringify({
      notebookFingerprint: opts.notebookFingerprint,
      chatProvider: opts.chatProvider,
      chatModel: opts.chatModel,
      userQuery: normalized,
    }),
  );
}

/* ------------------------------------------------------------------ */
/*  Pre-flight checks                                                 */
/* ------------------------------------------------------------------ */

async function hasPendingEmbeddings(notebookId: string): Promise<boolean> {
  const db = coreDb();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sourceChunks)
    .where(
      and(
        eq(sourceChunks.notebookId, notebookId),
        isNull(sourceChunks.embeddingDim),
      ),
    );
  return (rows[0]?.count ?? 0) > 0;
}

async function resolveChatModelMeta(userId: string): Promise<{
  provider: string;
  model: string;
  contextWindow: number | undefined;
}> {
  const db = coreDb();
  const [cfg] = await db
    .select({
      provider: userAiConfig.chatProvider,
      model: userAiConfig.chatModel,
    })
    .from(userAiConfig)
    .where(eq(userAiConfig.userId, userId))
    .limit(1);
  if (!cfg?.provider || !cfg?.model) {
    throw new Error(
      "No chat provider configured for this user — cannot run notebook research.",
    );
  }
  const contextWindow = isValidProviderId(cfg.provider)
    ? getModel(cfg.provider, cfg.model)?.contextWindow
    : undefined;
  return { provider: cfg.provider, model: cfg.model, contextWindow };
}

/* ------------------------------------------------------------------ */
/*  Retry helper                                                       */
/* ------------------------------------------------------------------ */

function isFatalLlmError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(401|403|404|invalid api key|unauthorized|forbidden)\b/i.test(msg);
}

/* ------------------------------------------------------------------ */
/*  Artifact rendering for kind prompts                                */
/* ------------------------------------------------------------------ */

const KINDS_PRESERVING_INLINE_CITATIONS = new Set([
  "briefing-doc",
  "study-guide",
  "faq",
  "timeline",
]);

const CHUNK_MARKER_RE = /\(chunk:[a-f0-9-]+\)/gi;

function stripChunkMarkers(s: string): string {
  return s
    .replace(CHUNK_MARKER_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Render the research artifact as the markdown blob a kind prompt
 * receives in its source-material slot. Inline `(chunk:UUID)` markers
 * are preserved for prose kinds (briefing, study-guide, faq, timeline)
 * so the UI can resolve citations; stripped for structured kinds
 * (mind-map, flashcards, quiz) where they'd corrupt JSON / markmap and
 * for audio-script where TTS would speak them aloud.
 */
export function renderArtifactForKind(
  artifact: ResearchArtifact,
  kind: string,
): string {
  const preserve = KINDS_PRESERVING_INLINE_CITATIONS.has(kind);
  const filter = preserve ? (s: string) => s : stripChunkMarkers;

  const lines: string[] = [];
  lines.push("# Notebook research artifact");
  lines.push("");
  lines.push("## Topic");
  lines.push(artifact.topic);
  lines.push("");
  lines.push("## Scope");
  lines.push(artifact.scope);
  lines.push("");
  lines.push("## Structure");
  lines.push(artifact.structuralOverview);
  lines.push("");
  lines.push("## Findings");
  for (const s of artifact.sections) {
    lines.push("");
    lines.push(`### ${s.subquestion}`);
    if (s.confidence === "low" && !s.content) {
      lines.push("_(Insufficient evidence in sources to address this.)_");
    } else {
      lines.push(filter(s.content));
    }
  }
  if (artifact.augmentations.length > 0) {
    lines.push("");
    lines.push("## Additional findings");
    for (const a of artifact.augmentations) {
      lines.push("");
      lines.push(`### ${a.gap}`);
      lines.push(filter(a.content));
    }
  }
  if (preserve) {
    const entries = Object.entries(artifact.citationMap);
    if (entries.length > 0) {
      lines.push("");
      lines.push("## Source index");
      for (const [chunkId, info] of entries) {
        lines.push(
          `- (chunk:${chunkId}) — ${info.sourceTitle ?? "Untitled source"}: ${info.snippet}`,
        );
      }
    }
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/*  In-flight dedup                                                    */
/* ------------------------------------------------------------------ */

const inFlight = new Map<string, Promise<RunNotebookResearchResult>>();

/* ------------------------------------------------------------------ */
/*  Public entry point                                                 */
/* ------------------------------------------------------------------ */

export async function runNotebookResearch(opts: {
  userId: string;
  notebookId: string;
  notebookTitle: string;
  notebookDescription: string | null;
  userQuery: string | null;
  chatModel: LanguageModel;
  onEvent?: (ev: ResearchEvent) => void;
}): Promise<RunNotebookResearchResult> {
  const t0 = Date.now();
  const emit = (ev: ResearchEvent) => opts.onEvent?.(ev);

  if (await hasPendingEmbeddings(opts.notebookId)) {
    emit({
      stage: "research:embedding-pending",
      message: "Embeddings still in flight — using direct source assembly",
    });
    return {
      artifact: null,
      fromCache: false,
      fallback: "embedding-pending",
      totalLlmCalls: 0,
      durationMs: Date.now() - t0,
    };
  }

  const meta = await resolveChatModelMeta(opts.userId);
  const fingerprint = await computeNotebookFingerprint(opts.notebookId);

  if (
    fingerprint ===
    sha256(
      JSON.stringify({
        chunkIds: [],
        sumTokens: 0,
        embeddingProvider: null,
        embeddingModel: null,
        embeddingDim: null,
      }),
    )
  ) {
    emit({
      stage: "research:no-sources",
      message: "No embedded chunks — using direct source assembly",
    });
    return {
      artifact: null,
      fromCache: false,
      fallback: "no-sources",
      totalLlmCalls: 0,
      durationMs: Date.now() - t0,
    };
  }

  const cacheKey = computeCacheKey({
    notebookFingerprint: fingerprint,
    chatProvider: meta.provider,
    chatModel: meta.model,
    userQuery: opts.userQuery,
  });

  const db = coreDb();
  const [cached] = await db
    .select()
    .from(notebookResearchReports)
    .where(eq(notebookResearchReports.cacheKey, cacheKey))
    .limit(1);
  if (cached) {
    emit({
      stage: "research:cache-hit",
      message: "Reusing prior research for this scope",
    });
    await db
      .update(notebookResearchReports)
      .set({ lastAccessedAt: new Date() })
      .where(eq(notebookResearchReports.id, cached.id));
    return {
      artifact: cached.artifact as ResearchArtifact,
      fromCache: true,
      fallback: null,
      totalLlmCalls: 0,
      durationMs: Date.now() - t0,
    };
  }

  const existing = inFlight.get(cacheKey);
  if (existing) {
    emit({
      stage: "research:cache-hit",
      message: "Awaiting in-flight research for this scope",
    });
    return await existing;
  }

  const runPromise = runPipeline({
    ...opts,
    fingerprint,
    meta,
    cacheKey,
    emit,
    startedAt: t0,
  }).finally(() => inFlight.delete(cacheKey));
  inFlight.set(cacheKey, runPromise);
  return await runPromise;
}

/* ------------------------------------------------------------------ */
/*  Pipeline                                                           */
/* ------------------------------------------------------------------ */

async function runPipeline(opts: {
  userId: string;
  notebookId: string;
  notebookTitle: string;
  notebookDescription: string | null;
  userQuery: string | null;
  chatModel: LanguageModel;
  fingerprint: string;
  meta: { provider: string; model: string; contextWindow: number | undefined };
  cacheKey: string;
  emit: (ev: ResearchEvent) => void;
  startedAt: number;
}): Promise<RunNotebookResearchResult> {
  const { emit } = opts;
  let llmCalls = 0;

  /* ── Phase 1: recon + plan (fused) ──────────────────────────────── */
  emit({
    stage: "research:recon-plan",
    message: "Analysing sources and planning sub-questions...",
  });

  const corpusBudgetChars = Math.floor(
    (opts.meta.contextWindow ?? DEFAULT_CONTEXT_WINDOW_TOKENS) *
      RECON_BUDGET_FRACTION *
      CHARS_PER_TOKEN,
  );
  const { sources: srcs, totalChars } = await loadNotebookSourcesFullText(
    opts.notebookId,
  );

  let corpusText: string;
  if (totalChars <= corpusBudgetChars) {
    corpusText = srcs
      .map((s) => `# ${s.title ?? "Untitled source"}\n\n${s.fullText}`)
      .join("\n\n---\n\n");
  } else {
    const summary = await assembleStudioSourceContent({
      userId: opts.userId,
      notebookId: opts.notebookId,
      kind: "study-guide",
      topic: opts.notebookTitle,
      chatModel: opts.chatModel,
    });
    corpusText = summary.content;
    if (summary.strategy === "map-reduce") {
      llmCalls += srcs.length;
    }
  }

  const reconPlan = await withRetry(
    async () => {
      const r = await generateObject({
        model: opts.chatModel,
        schema: z.object({
          topic: z.string().min(2),
          scope: z.string().min(2),
          structuralOverview: z.string().min(2),
          subquestions: z
            .array(z.string().min(8))
            .min(MIN_SUBQUESTIONS)
            .max(MAX_SUBQUESTIONS),
        }),
        prompt: notebookReconPlanPrompt({
          corpusText,
          notebookTitle: opts.notebookTitle,
          notebookDescription: opts.notebookDescription,
          userQuery: opts.userQuery,
        }),
      });
      return r.object;
    },
    {
      maxAttempts: 3,
      shouldRetry: (e) => !isFatalLlmError(e),
    },
  );
  llmCalls++;

  /* ── Phase 2: retrieve per sub-question ─────────────────────────── */
  emit({
    stage: "research:retrieve",
    message: `Retrieving passages... (0/${reconPlan.subquestions.length})`,
    current: 0,
    total: reconPlan.subquestions.length,
  });
  const retrievals: { subquestion: string; chunks: RetrievedChunk[] }[] = [];
  let retrieveDone = 0;
  for (const subq of reconPlan.subquestions) {
    const chunks = await retrieveForQuery({
      userId: opts.userId,
      notebookId: opts.notebookId,
      query: subq,
      topK: TOPK_PER_SUBQUESTION,
    });
    retrievals.push({ subquestion: subq, chunks });
    retrieveDone++;
    emit({
      stage: "research:retrieve",
      message: `Retrieving passages... (${retrieveDone}/${reconPlan.subquestions.length})`,
      current: retrieveDone,
      total: reconPlan.subquestions.length,
    });
  }

  /* ── Phase 3: synthesize per sub-question ───────────────────────── */
  emit({
    stage: "research:synthesize",
    message: `Synthesising findings... (0/${retrievals.length})`,
    current: 0,
    total: retrievals.length,
  });

  const citationMap: ResearchArtifact["citationMap"] = {};
  const recordCitation = (c: RetrievedChunk) => {
    if (!citationMap[c.chunkId]) {
      citationMap[c.chunkId] = {
        sourceId: c.sourceId,
        sourceTitle: c.sourceTitle,
        snippet: c.content.slice(0, SNIPPET_LEN),
      };
    }
  };
  const buildSourcesBlock = (chunks: RetrievedChunk[]): string =>
    chunks
      .map((c, i) => {
        recordCitation(c);
        return `[${i + 1}] ${c.sourceTitle}\n${c.content}\n(chunk:${c.chunkId})`;
      })
      .join("\n\n---\n\n");

  const synthSection = async (
    item: { subquestion: string; chunks: RetrievedChunk[] },
    topK: number,
  ): Promise<{ content: string; chunkIds: string[] }> => {
    const chunks = item.chunks.slice(0, topK);
    if (chunks.length === 0) {
      return { content: "", chunkIds: [] };
    }
    const result = await generateText({
      model: opts.chatModel,
      prompt: notebookSynthesizePrompt({
        subquestion: item.subquestion,
        sourcesBlock: buildSourcesBlock(chunks),
        topic: reconPlan.topic,
      }),
    });
    return {
      content: result.text.trim(),
      chunkIds: chunks.map((c) => c.chunkId),
    };
  };

  const sections: ResearchArtifact["sections"] = [];
  let synthDone = 0;
  for (let i = 0; i < retrievals.length; i += SYNTH_BATCH_SIZE) {
    const batch = retrievals.slice(i, i + SYNTH_BATCH_SIZE);
    const settled = await Promise.allSettled(
      batch.map(async (item) => {
        try {
          const r = await synthSection(item, TOPK_PER_SUBQUESTION);
          return { item, result: r, confidence: "high" as const };
        } catch {
          try {
            const r = await synthSection(item, TOPK_PER_SUBQUESTION_RETRY);
            return { item, result: r, confidence: "high" as const };
          } catch {
            return {
              item,
              result: { content: "", chunkIds: [] },
              confidence: "low" as const,
            };
          }
        }
      }),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") {
        const { item, result, confidence } = r.value;
        if (confidence === "low" || !result.content) {
          sections.push({
            subquestion: item.subquestion,
            content: "",
            chunkIds: [],
            confidence: "low",
          });
        } else {
          sections.push({
            subquestion: item.subquestion,
            content: result.content,
            chunkIds: result.chunkIds,
            confidence,
          });
        }
      }
      synthDone++;
      emit({
        stage: "research:synthesize",
        message: `Synthesising findings... (${synthDone}/${retrievals.length})`,
        current: synthDone,
        total: retrievals.length,
      });
    }
    llmCalls += batch.length;
  }

  /* ── Phase 4: reflect ───────────────────────────────────────────── */
  emit({
    stage: "research:reflect",
    message: "Identifying gaps in coverage...",
  });
  const assembledFindings = sections
    .map((s) =>
      s.content
        ? `### ${s.subquestion}\n${s.content}`
        : `### ${s.subquestion}\n[Insufficient evidence found.]`,
    )
    .join("\n\n");

  const reflect = await withRetry(
    async () => {
      const r = await generateObject({
        model: opts.chatModel,
        schema: z.object({
          gaps: z.array(z.string().min(8)).max(MAX_GAPS),
        }),
        prompt: notebookReflectPrompt({
          topic: reconPlan.topic,
          scope: reconPlan.scope,
          userQuery: opts.userQuery,
          assembledFindings,
        }),
      });
      return r.object;
    },
    {
      maxAttempts: 3,
      shouldRetry: (e) => !isFatalLlmError(e),
    },
  );
  llmCalls++;

  /* ── Phase 5: augment per gap ───────────────────────────────────── */
  const augmentations: ResearchArtifact["augmentations"] = [];
  if (reflect.gaps.length > 0) {
    emit({
      stage: "research:augment",
      message: `Filling gaps... (0/${reflect.gaps.length})`,
      current: 0,
      total: reflect.gaps.length,
    });
    let augDone = 0;
    for (const gap of reflect.gaps) {
      try {
        const chunks = await retrieveForQuery({
          userId: opts.userId,
          notebookId: opts.notebookId,
          query: gap,
          topK: TOPK_PER_GAP,
        });
        if (chunks.length > 0) {
          const result = await generateText({
            model: opts.chatModel,
            prompt: notebookSynthesizePrompt({
              subquestion: gap,
              sourcesBlock: buildSourcesBlock(chunks),
              topic: reconPlan.topic,
            }),
          });
          augmentations.push({
            gap,
            content: result.text.trim(),
            chunkIds: chunks.map((c) => c.chunkId),
          });
          llmCalls++;
        }
      } catch {
        // Gap fill is best-effort; skip on failure.
      }
      augDone++;
      emit({
        stage: "research:augment",
        message: `Filling gaps... (${augDone}/${reflect.gaps.length})`,
        current: augDone,
        total: reflect.gaps.length,
      });
    }
  }

  /* ── Phase 6: assemble + persist ────────────────────────────────── */
  emit({
    stage: "research:assemble",
    message: "Assembling research artifact...",
  });
  const artifact: ResearchArtifact = {
    topic: reconPlan.topic,
    scope: reconPlan.scope,
    structuralOverview: reconPlan.structuralOverview,
    subquestions: reconPlan.subquestions,
    sections,
    augmentations,
    citationMap,
  };
  const durationMs = Date.now() - opts.startedAt;

  const db = coreDb();
  try {
    await db.insert(notebookResearchReports).values({
      notebookId: opts.notebookId,
      cacheKey: opts.cacheKey,
      notebookFingerprint: opts.fingerprint,
      userQuery: opts.userQuery ?? null,
      chatProvider: opts.meta.provider,
      chatModel: opts.meta.model,
      artifact,
      totalLlmCalls: llmCalls,
      durationMs,
    });
  } catch (err) {
    // Unique-constraint race (multi-process or rare in-process collision):
    // another caller persisted under this key while we were running. Use
    // theirs — the artifacts are scope-equivalent by construction.
    const [existing] = await db
      .select()
      .from(notebookResearchReports)
      .where(eq(notebookResearchReports.cacheKey, opts.cacheKey))
      .limit(1);
    if (existing) {
      return {
        artifact: existing.artifact as ResearchArtifact,
        fromCache: true,
        fallback: null,
        totalLlmCalls: llmCalls,
        durationMs,
      };
    }
    throw err;
  }

  return {
    artifact,
    fromCache: false,
    fallback: null,
    totalLlmCalls: llmCalls,
    durationMs,
  };
}
