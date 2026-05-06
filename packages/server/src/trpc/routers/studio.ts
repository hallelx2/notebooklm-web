import { getChatModel, NoAiConfigError } from "@notebooklm/core/ai/factory";
import { notebooks, sources, studioOutputs } from "@notebooklm/core/db/schema";
import { isReadable } from "@notebooklm/core/ingest/parse";
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
  // ABOUT — not just whatever happens to fill the first 20 KB of source
  // text. Without this, mind-maps over heterogeneous sources (or sources
  // containing generic boilerplate) drift into off-topic structures
  // (e.g. summarising the PDF *file format* when the notebook is about
  // metaheuristic optimisation).
  const base = `You are an expert content creator helping a user produce study artefacts about a specific topic.

Topic: ${topic}${description ? `\nTopic context: ${description}` : ""}

Stay anchored to the topic above. Treat the source material as evidence for the topic, not as a subject in itself. Skip incidental content that isn't relevant to the topic — file-format boilerplate, document-structure metadata, page footers, references sections, or anything else that's about HOW the source is presented rather than what it teaches.

Source Material:
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

    const readySources = await adapter.db
      .select({ content: sources.content })
      .from(sources)
      .where(
        and(eq(sources.notebookId, notebookId), eq(sources.status, "ready")),
      );

    // Defense-in-depth: even rows marked status="ready" can carry
    // mojibake if they were ingested before the parse-time guard
    // landed (or by a parallel path that bypassed it). Filter those
    // out HERE so they can't poison the studio prompt with binary
    // junk and steer the model toward off-topic output.
    let skipped = 0;
    let combinedContent = "";
    for (const s of readySources) {
      if (!s.content) continue;
      const check = isReadable(s.content);
      if (!check.ok) {
        skipped++;
        continue;
      }
      combinedContent += s.content + "\n\n";
      if (combinedContent.length >= 20000) break;
    }
    combinedContent = combinedContent.slice(0, 20000);

    if (!combinedContent.trim()) {
      throw new Error(
        skipped > 0
          ? `No readable source content available. ${skipped} source${skipped === 1 ? " was" : "s were"} skipped because text extraction produced unreadable content (likely image-only PDFs or encrypted streams). Try re-ingesting with OCR, or add a different source.`
          : "No source content available. Add sources to the notebook first.",
      );
    }

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
      .set({ content, status: "ready" })
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
        .set({ status: "error", content: { error: errorMessage } })
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
      await ctx.adapter.db.delete(studioOutputs).where(eq(studioOutputs.id, input.id));
      return { id: input.id };
    }),
});
