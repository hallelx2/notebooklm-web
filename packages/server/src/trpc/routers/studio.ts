import { getChatModel, NoAiConfigError } from "@notebooklm/core/ai/factory";
import { notebooks, studioOutputs } from "@notebooklm/core/db/schema";
import {
  type ResearchEvent,
  renderArtifactForKind,
  runNotebookResearch,
} from "@notebooklm/core/notebook-research";
import { assembleStudioSourceContent } from "@notebooklm/core/notebook-text";
import { generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../../adapter";
import { protectedProcedure, router } from "../context";
import { NullableIdResultSchema, StudioOutputSchema } from "../schemas";

async function assertOwnsNotebook(
  adapter: PlatformAdapter,
  notebookId: string,
  userId: string,
) {
  const [nb] = await adapter.db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)))
    .limit(1);
  if (!nb) throw new Error("Notebook not found");
  return nb;
}

const KIND_TITLES: Record<string, string> = {
  "audio-overview": "Audio Overview",
  "study-guide": "Study Guide",
  "briefing-doc": "Briefing Document",
  faq: "FAQ",
  timeline: "Timeline",
  "mind-map": "Mind Map",
  flashcards: "Flashcards",
  quiz: "Quiz",
};

const STRUCTURED_KINDS = new Set(["mind-map", "flashcards", "quiz"]);

function buildPrompt(
  kind: string,
  sourceContent: string,
  opts: {
    topic: string;
    description?: string | null;
    questionCount?: number;
  },
): string {
  const topic = opts.topic.trim() || "this notebook";
  const description = opts.description?.trim();

  // Topic-grounded preamble. Anchors the model to what the notebook is
  // ABOUT and frames the input as a research artifact — not raw text
  // for the model to summarise. The artifact is the output of a
  // structured research pass over the notebook (recon → plan →
  // retrieve → synthesise → reflect → augment) so the kind generation
  // step is shaping curated findings, not extracting from raw source
  // material. The "Notebook research artifact" wording matters: when
  // we said "Source Material" the model occasionally tried to report
  // ON the artifact instead of generating from it.
  const base = `You are an expert content creator producing a study artefact about a specific topic, grounded in a notebook research artifact.

Topic: ${topic}${description ? `\nTopic context: ${description}` : ""}

The artifact below is the output of a structured research pass over the user's notebook sources — sub-questions, findings, citations, and gaps. Treat it as your source of truth. Do NOT invent facts that aren't in it. Do NOT report on the artifact itself ("the research covers...") — generate the requested study artefact directly from the findings. Where the artifact contains \`(chunk:UUID)\` markers, preserve them in any prose-style output (briefing-doc, study-guide, FAQ, timeline) so the UI can resolve them to source citations; OMIT them from structured outputs (mind-map, flashcards, quiz) and from spoken outputs (audio-script).

Notebook research artifact:
${sourceContent}

`;

  switch (kind) {
    case "audio-overview":
      return (
        base +
        `Generate a podcast-style script about "${topic}" with two hosts in dialogue. Include natural conversational transitions, an introduction that establishes the topic, key discussion points drawn from the source material, and a conclusion. Format it as a script with speaker labels.`
      );
    case "study-guide":
      return (
        base +
        `Generate a comprehensive study guide for "${topic}" with key concepts, definitions, review questions, and summaries for each major sub-topic. Organize it with clear headings and bullet points.`
      );
    case "briefing-doc":
      return (
        base +
        `Generate an executive briefing document on "${topic}". Include an executive summary, key findings, analysis, implications, and recommended actions. Keep it concise and professional.`
      );
    case "faq":
      return (
        base +
        `Generate a FAQ about "${topic}" with 10-15 questions and detailed answers grounded in the source material. Cover the most important sub-topics and common points of confusion.`
      );
    case "timeline":
      return (
        base +
        `Generate a chronological timeline of key events and developments related to "${topic}" mentioned in the source material. Include dates (or relative ordering) and brief descriptions for each entry. Skip events that are about the source documents themselves (publication dates, revisions) unless they're directly relevant to the topic.`
      );
    case "mind-map":
      return (
        base +
        `Generate a mind map about "${topic}" in Markdown heading format for use with the markmap library.

Rules:
- The single \`#\` root MUST be "${topic}" (or a tighter rephrasing of it). Do NOT pick a different central node.
- Use \`##\` for main branches that decompose "${topic}" into 4-7 sub-areas.
- Use \`###\` for sub-topics under each branch (2-5 per branch).
- Use \`####\` for further details where appropriate (1-3 per sub-topic).
- Keep each node text concise (max 6-8 words).
- Every node must be ABOUT the topic. Do NOT include generic file-format terms (PDF objects, document structure, headers, content streams, annotations, cross-reference tables, etc.) unless those concepts are themselves central to "${topic}".
- Do NOT include any fenced code blocks, do NOT wrap in backticks.
- Return ONLY the markdown, nothing else.

Example shape (for a hypothetical topic "Artificial Intelligence"):
# Artificial Intelligence
## Machine Learning
### Supervised Learning
#### Classification
#### Regression
### Unsupervised Learning
## Deep Learning
### Neural Networks
### CNNs`
      );
    case "flashcards":
      return (
        base +
        `Generate flashcards about "${topic}" as a JSON array with the following structure: [{ "front": "question or term", "back": "answer or definition" }]. Create 15-25 flashcards covering the key concepts of the topic. Return ONLY valid JSON, no other text.`
      );
    case "quiz": {
      const count = opts?.questionCount ?? 10;
      return (
        base +
        `Generate a quiz about "${topic}" as a JSON array with the following structure: [{ "question": "question text", "options": ["option A", "option B", "option C", "option D"], "answer": 0 }] where answer is the zero-based index of the correct option. Create exactly ${count} questions, all about "${topic}". Return ONLY valid JSON, no other text.`
      );
    }
    default:
      return (
        base +
        `Generate a helpful summary and analysis about "${topic}", grounded in the source material.`
      );
  }
}

/**
 * Background worker for `studio.generate`. Runs the chat-model call
 * + content shaping + status update outside the tRPC request lifetime
 * so the client gets a sub-second response and the LLM is free to take
 * as long as it needs. All errors are caught and persisted as a row
 * status flip — nothing escapes to the unhandled-rejection handler.
 */
async function runGeneration(args: {
  adapter: PlatformAdapter;
  userId: string;
  rowId: string;
  kind: string;
  notebookId: string;
  topic: string;
  description: string | null;
  questionCount: number | undefined;
  userQuery: string | null;
}): Promise<void> {
  const { adapter, userId, rowId, kind, notebookId } = args;
  try {
    let chatModel: Awaited<ReturnType<typeof getChatModel>>;
    try {
      chatModel = await getChatModel(userId);
    } catch (err) {
      if (err instanceof NoAiConfigError) {
        throw new Error(
          "Configure a chat provider in Settings before generating studio outputs.",
        );
      }
      throw err;
    }

    // Mirror research-pipeline phase events to the row's `progress`
    // jsonb so the UI's polling on `studio.list` can surface a live
    // spinner-cycle through recon → plan → retrieve → synthesise →
    // reflect → augment → assemble → generate. Best-effort writes —
    // a transient DB hiccup shouldn't fail the generation.
    const updateProgress = async (snapshot: {
      stage: string;
      message: string;
      current?: number;
      total?: number;
    }) => {
      try {
        await adapter.db
          .update(studioOutputs)
          .set({
            progress: { ...snapshot, updatedAt: new Date().toISOString() },
          })
          .where(eq(studioOutputs.id, rowId));
      } catch {
        // swallow: next phase's update will supersede the missed one
      }
    };
    const onResearchEvent = (ev: ResearchEvent) => {
      void updateProgress(ev);
    };

    // Phase A: structured notebook research over `source_chunks`.
    // Cache hit (same notebook fingerprint + chat model + userQuery)
    // skips the pipeline; otherwise we run the full plan/retrieve/
    // synthesise/reflect/augment loop and persist the artifact.
    const research = await runNotebookResearch({
      userId,
      notebookId,
      notebookTitle: args.topic,
      notebookDescription: args.description,
      userQuery: args.userQuery,
      chatModel,
      onEvent: onResearchEvent,
    });

    // biome-ignore lint/suspicious/noConsole: visible signal in dev logs
    console.info(
      `[studio.generate] ${kind} (${rowId}) research fromCache=${research.fromCache} fallback=${research.fallback ?? "none"} llmCalls=${research.totalLlmCalls} durationMs=${research.durationMs}`,
    );

    // Phase B: render the artifact for the kind's prompt. Falls back
    // to the legacy direct source-assembly path when research bailed
    // (notebook has no embedded chunks, or embeddings are mid-flight).
    let combinedContent: string;
    if (research.artifact) {
      combinedContent = renderArtifactForKind(research.artifact, kind);
    } else {
      const fallback = await assembleStudioSourceContent({
        userId,
        notebookId,
        kind,
        topic: args.topic,
        chatModel,
      });
      // biome-ignore lint/suspicious/noConsole: visible signal in dev logs
      console.info(
        `[studio.generate] ${kind} (${rowId}) fallback assembly strategy=${fallback.strategy} totalChars=${fallback.totalChars} skipped=${fallback.skippedSourceCount}`,
      );
      if (!fallback.content.trim()) {
        throw new Error(
          fallback.skippedSourceCount > 0
            ? `No readable source content available. ${fallback.skippedSourceCount} source${fallback.skippedSourceCount === 1 ? " was" : "s were"} skipped because text extraction produced unreadable content (likely image-only PDFs or encrypted streams). Try re-ingesting with OCR, or add a different source.`
            : "No source content available. Add sources to the notebook first.",
        );
      }
      combinedContent = fallback.content;
    }

    void updateProgress({
      stage: "generate",
      message: `Generating ${kind}...`,
    });

    const prompt = buildPrompt(kind, combinedContent, {
      topic: args.topic,
      description: args.description,
      questionCount: args.questionCount,
    });

    const { text: generatedText } = await generateText({
      model: chatModel,
      prompt,
    });

    let content: unknown;
    if (kind === "mind-map") {
      const cleaned = generatedText
        .replace(/^```(?:markdown|md)?\s*\n?/i, "")
        .replace(/\n?```\s*$/i, "")
        .trim();
      content = { markdown: cleaned };
    } else if (STRUCTURED_KINDS.has(kind)) {
      try {
        const cleaned = generatedText
          .replace(/^```(?:json)?\s*\n?/i, "")
          .replace(/\n?```\s*$/i, "")
          .trim();
        content = JSON.parse(cleaned);
      } catch {
        // If JSON parsing fails, store as text
        content = { text: generatedText };
      }
    } else {
      content = { text: generatedText };
    }

    await adapter.db
      .update(studioOutputs)
      .set({ content, status: "ready", progress: null })
      .where(eq(studioOutputs.id, rowId));
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    // biome-ignore lint/suspicious/noConsole: surfaces the actual stack to desktop.log
    console.error(
      `[studio.generate] ${kind} (${rowId}) failed:`,
      err instanceof Error ? err.stack || err.message : err,
    );
    try {
      await adapter.db
        .update(studioOutputs)
        .set({
          status: "error",
          content: { error: errorMessage },
          progress: null,
        })
        .where(eq(studioOutputs.id, rowId));
    } catch (writeErr) {
      // Last-ditch — if even the error write fails, the launch-time
      // `reapOrphanedJobs` sweep will clean up the row eventually.
      // biome-ignore lint/suspicious/noConsole: critical-path diagnostic
      console.error(
        `[studio.generate] failed to persist error status for ${rowId}:`,
        writeErr,
      );
    }
  }
}

export const studioRouter = router({
  list: protectedProcedure
    .input(z.object({ notebookId: z.string().uuid() }))
    .output(z.array(StudioOutputSchema))
    .query(async ({ input, ctx }) => {
      await assertOwnsNotebook(ctx.adapter, input.notebookId, ctx.user.id);
      return ctx.adapter.db
        .select()
        .from(studioOutputs)
        .where(eq(studioOutputs.notebookId, input.notebookId))
        .orderBy(desc(studioOutputs.createdAt));
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(StudioOutputSchema.nullable())
    .query(async ({ input, ctx }) => {
      const [row] = await ctx.adapter.db
        .select()
        .from(studioOutputs)
        .where(eq(studioOutputs.id, input.id))
        .limit(1);
      if (!row) return null;
      await assertOwnsNotebook(ctx.adapter, row.notebookId, ctx.user.id);
      return row;
    }),

  generate: protectedProcedure
    .input(
      z.object({
        notebookId: z.string().uuid(),
        kind: z.string(),
        questionCount: z.number().int().min(5).max(30).optional(),
        /**
         * Optional free-text scope for the underlying notebook research
         * pass. Empty/undefined → "default scope" key (artifacts shared
         * across kinds on the same notebook). Different non-empty values
         * regenerate the artifact — different research paths require
         * different content.
         */
        userQuery: z.string().max(500).optional(),
      }),
    )
    .output(StudioOutputSchema)
    .mutation(async ({ input, ctx }) => {
      // Capture the notebook record so we can use its title + description
      // as the *topic* the studio prompts ground on. Without this anchor,
      // the model can drift onto whatever pattern wins by token count in
      // the source content (notably: PDF format internals when a source
      // happens to mention them) instead of the user's actual subject.
      const nb = await assertOwnsNotebook(
        ctx.adapter,
        input.notebookId,
        ctx.user.id,
      );

      const title = KIND_TITLES[input.kind] ?? input.kind;

      const [row] = await ctx.adapter.db
        .insert(studioOutputs)
        .values({
          notebookId: input.notebookId,
          kind: input.kind,
          title,
          status: "generating",
        })
        .returning();

      // Fire-and-forget the LLM work. Returning the inserted row
      // immediately means the desktop client's 15s fetch timeout
      // (apps/desktop/src/providers/ApiBaseUrlProvider.tsx) doesn't
      // collide with quiz/study-guide/etc. generations that routinely
      // run 30–120s. The renderer's StudioPanel polls `studio.list`
      // every 2s while any row has status "generating" and picks up
      // the eventual `ready`/`error` flip.
      //
      // If the process dies mid-generation, `reapOrphanedJobs` in
      // apps/desktop/src/server/stub-adapter.ts marks the leftover
      // row as `error` on next launch — no stuck spinners.
      void runGeneration({
        adapter: ctx.adapter,
        userId: ctx.user.id,
        rowId: row.id,
        kind: input.kind,
        notebookId: input.notebookId,
        topic: nb.title,
        description: nb.description,
        questionCount: input.questionCount,
        userQuery: input.userQuery?.trim() ? input.userQuery.trim() : null,
      });

      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(NullableIdResultSchema)
    .mutation(async ({ input, ctx }) => {
      const [row] = await ctx.adapter.db
        .select()
        .from(studioOutputs)
        .where(eq(studioOutputs.id, input.id))
        .limit(1);
      if (!row) return null;
      await assertOwnsNotebook(ctx.adapter, row.notebookId, ctx.user.id);
      await ctx.adapter.db
        .delete(studioOutputs)
        .where(eq(studioOutputs.id, input.id));
      return { id: input.id };
    }),
});
