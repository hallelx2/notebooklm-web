/**
 * Notebook full-text assembly for the studio path.
 *
 * Studio outputs (mind-map, briefing-doc, study-guide, FAQ, timeline,
 * flashcards, quiz, audio-script) need the entire notebook content as
 * input — not the 20 KB `sources.content` preview that lives on the
 * source row. The full text lives in `source_chunks` (chunked at ingest
 * for retrieval). This module loads it back, sizes the input to the
 * user's chat-model context window, and falls back to map-reduce
 * per-source summarisation when the notebook exceeds the budget.
 */
import { generateText, type LanguageModel } from "ai";
import { and, asc, eq } from "drizzle-orm";
import { studioSummarizePrompt } from "./agent/runtimes/ai-sdk/prompts/studio-summarize";
import { getModel, isValidProviderId } from "./ai/providers";
import { sourceChunks, sources, userAiConfig } from "./db/schema";
import { isReadable } from "./ingest/parse";
import { coreDb } from "./runtime";

/** Same heuristic the chunker uses (`packages/core/src/ingest/chunk.ts`). */
const CHARS_PER_TOKEN = 4;

/**
 * Conservative fallback when the user's selected model isn't in our
 * provider catalog (custom OpenAI-compatible endpoint, Ollama, etc.).
 * 100 K tokens covers most modern open-weight models without blowing
 * up smaller ones too badly.
 */
const DEFAULT_CONTEXT_WINDOW_TOKENS = 100_000;

const SUMMARY_BATCH_SIZE = 4;

export interface NotebookSourceFullText {
  sourceId: string;
  title: string | null;
  fullText: string;
  charLen: number;
}

/**
 * Reconstruct full source text from chunks. Returns one bundle per
 * source with chunks ordered by ordinal. Drops sources with no chunks
 * (i.e. unembedded or empty) — they're invisible to studio just as
 * they're invisible to chat retrieval.
 *
 * Filters on `sources.status = "ready"` to mirror the existing studio
 * behaviour. Sources still parsing/embedding don't get pulled into a
 * generation that's running concurrently with their ingest.
 */
export async function loadNotebookSourcesFullText(notebookId: string): Promise<{
  sources: NotebookSourceFullText[];
  totalChars: number;
}> {
  const db = coreDb();
  const rows = await db
    .select({
      sourceId: sources.id,
      sourceTitle: sources.title,
      ordinal: sourceChunks.ordinal,
      content: sourceChunks.content,
    })
    .from(sources)
    .innerJoin(sourceChunks, eq(sourceChunks.sourceId, sources.id))
    .where(and(eq(sources.notebookId, notebookId), eq(sources.status, "ready")))
    .orderBy(asc(sources.id), asc(sourceChunks.ordinal));

  const bySource = new Map<
    string,
    { title: string | null; chunks: string[] }
  >();
  for (const r of rows) {
    let bucket = bySource.get(r.sourceId);
    if (!bucket) {
      bucket = { title: r.sourceTitle, chunks: [] };
      bySource.set(r.sourceId, bucket);
    }
    bucket.chunks.push(r.content);
  }

  const out: NotebookSourceFullText[] = [];
  let totalChars = 0;
  for (const [sourceId, bucket] of bySource) {
    const fullText = bucket.chunks.join("\n\n");
    totalChars += fullText.length;
    out.push({
      sourceId,
      title: bucket.title,
      fullText,
      charLen: fullText.length,
    });
  }
  return { sources: out, totalChars };
}

/**
 * Compute how many characters of source content fit into the chat
 * model's context window after reserving room for the prompt scaffolding
 * and the model's own output. Returns BOTH chars and tokens because
 * callers occasionally want to log either.
 */
export function studioCharBudget(opts: {
  contextWindow?: number;
  outputReserveFraction?: number;
  promptOverheadFraction?: number;
}): { budgetChars: number; budgetTokens: number } {
  const window = opts.contextWindow ?? DEFAULT_CONTEXT_WINDOW_TOKENS;
  const outputReserve = opts.outputReserveFraction ?? 0.3;
  const promptOverhead = opts.promptOverheadFraction ?? 0.1;
  // Floor of 10% sources keeps a sane budget if the caller passes weird
  // reserve fractions; in practice the defaults sum to 0.4 so the source
  // share is 0.6 of the window.
  const sourceFraction = Math.max(0.1, 1 - outputReserve - promptOverhead);
  const budgetTokens = Math.floor(window * sourceFraction);
  return { budgetTokens, budgetChars: budgetTokens * CHARS_PER_TOKEN };
}

async function resolveContextWindow(
  userId: string,
): Promise<number | undefined> {
  const db = coreDb();
  const [cfg] = await db
    .select({
      provider: userAiConfig.chatProvider,
      model: userAiConfig.chatModel,
    })
    .from(userAiConfig)
    .where(eq(userAiConfig.userId, userId))
    .limit(1);
  if (!cfg?.provider || !cfg?.model) return undefined;
  if (!isValidProviderId(cfg.provider)) return undefined;
  return getModel(cfg.provider, cfg.model)?.contextWindow;
}

export type StudioAssemblyStrategy =
  | "full"
  | "map-reduce"
  | "truncated"
  | "empty";

export interface AssembleStudioSourceResult {
  /** The string to feed into the studio prompt's source-material slot. */
  content: string;
  /** Which path produced `content` — surfaced to logs/observability. */
  strategy: StudioAssemblyStrategy;
  /** Total chars across all readable sources before any budgeting. */
  totalChars: number;
  /** The char budget computed from the model's context window. */
  budgetChars: number;
  /** Sources that were skipped because their text wasn't readable. */
  skippedSourceCount: number;
  /** Sources whose summarisation call failed (only set in map-reduce). */
  failedSummaryCount: number;
}

/**
 * Top-level assembler the studio handlers call. Loads full notebook
 * text, applies `isReadable` per source, sizes the result against the
 * chat model's context window, and falls back to per-source map-reduce
 * summarisation when the notebook exceeds the budget.
 *
 * Map-reduce uses `Promise.allSettled` per batch so a single source's
 * summariser failure doesn't kill the whole studio generation — the
 * remaining sources still flow through.
 */
export async function assembleStudioSourceContent(opts: {
  userId: string;
  notebookId: string;
  /** Studio output kind (mind-map, briefing-doc, ..., audio-script). */
  kind: string;
  /** Notebook title — anchors the kind-aware summariser. */
  topic: string;
  /** The user's resolved chat model. */
  chatModel: LanguageModel;
  /**
   * Optional override for the per-batch summariser concurrency. Defaults
   * to {@link SUMMARY_BATCH_SIZE}.
   */
  summaryBatchSize?: number;
}): Promise<AssembleStudioSourceResult> {
  const { sources: srcs } = await loadNotebookSourcesFullText(opts.notebookId);

  const readable: NotebookSourceFullText[] = [];
  let skippedSourceCount = 0;
  for (const s of srcs) {
    if (!s.fullText.trim()) {
      skippedSourceCount++;
      continue;
    }
    if (!isReadable(s.fullText).ok) {
      skippedSourceCount++;
      continue;
    }
    readable.push(s);
  }

  const totalChars = readable.reduce((acc, s) => acc + s.charLen, 0);
  const contextWindow = await resolveContextWindow(opts.userId);
  const { budgetChars } = studioCharBudget({ contextWindow });

  if (readable.length === 0) {
    return {
      content: "",
      strategy: "empty",
      totalChars,
      budgetChars,
      skippedSourceCount,
      failedSummaryCount: 0,
    };
  }

  // Strategy 1: full content fits the budget — concatenate raw chunks
  // with a per-source `# Title` header so the downstream prompt can see
  // document boundaries.
  if (totalChars <= budgetChars) {
    const content = readable
      .map((s) => `# ${s.title ?? "Untitled source"}\n\n${s.fullText}`)
      .join("\n\n---\n\n");
    return {
      content,
      strategy: "full",
      totalChars,
      budgetChars,
      skippedSourceCount,
      failedSummaryCount: 0,
    };
  }

  // Strategy 2: map-reduce summarisation. Per-source kind-aware summary
  // -> concatenate -> if combined summaries still exceed the budget,
  // hard-truncate (rare on modern models).
  const batchSize = Math.max(1, opts.summaryBatchSize ?? SUMMARY_BATCH_SIZE);
  const summaries: Array<{ title: string | null; summary: string }> = [];
  let failedSummaryCount = 0;

  for (let i = 0; i < readable.length; i += batchSize) {
    const batch = readable.slice(i, i + batchSize);
    const settled = await Promise.allSettled(
      batch.map(async (s) => {
        const { text } = await generateText({
          model: opts.chatModel,
          prompt: studioSummarizePrompt({
            kind: opts.kind,
            topic: opts.topic,
            title: s.title ?? "Untitled source",
            text: s.fullText,
          }),
        });
        return { title: s.title, summary: text.trim() };
      }),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") {
        if (r.value.summary) summaries.push(r.value);
        else failedSummaryCount++;
      } else {
        failedSummaryCount++;
      }
    }
  }

  if (summaries.length === 0) {
    return {
      content: "",
      strategy: "empty",
      totalChars,
      budgetChars,
      skippedSourceCount,
      failedSummaryCount,
    };
  }

  let content = summaries
    .map((s) => `# ${s.title ?? "Untitled source"}\n\n${s.summary}`)
    .join("\n\n---\n\n");

  if (content.length <= budgetChars) {
    return {
      content,
      strategy: "map-reduce",
      totalChars,
      budgetChars,
      skippedSourceCount,
      failedSummaryCount,
    };
  }

  content = content.slice(0, budgetChars);
  return {
    content,
    strategy: "truncated",
    totalChars,
    budgetChars,
    skippedSourceCount,
    failedSummaryCount,
  };
}
