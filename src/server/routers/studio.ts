import { generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notebooks, sources, studioOutputs } from "@/db/schema";
import { getChatModel, NoAiConfigError } from "@/lib/ai/factory";
import { protectedProcedure, router } from "../trpc";

async function assertOwnsNotebook(notebookId: string, userId: string) {
  const [nb] = await db
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
  opts?: { questionCount?: number },
): string {
  const base = `You are an expert content creator. Based on the following source material, generate the requested output.\n\nSource Material:\n${sourceContent}\n\n`;

  switch (kind) {
    case "audio-overview":
      return (
        base +
        "Generate a podcast-style script with host dialogue. Include natural conversational transitions, an introduction, key discussion points, and a conclusion. Format it as a script with speaker labels."
      );
    case "study-guide":
      return (
        base +
        "Generate a comprehensive study guide with key concepts, definitions, review questions, and summaries for each major topic. Organize it with clear headings and bullet points."
      );
    case "briefing-doc":
      return (
        base +
        "Generate an executive briefing document. Include an executive summary, key findings, analysis, implications, and recommended actions. Keep it concise and professional."
      );
    case "faq":
      return (
        base +
        "Generate a FAQ with 10-15 questions and detailed answers based on the source material. Cover the most important topics and common points of confusion."
      );
    case "timeline":
      return (
        base +
        "Generate a chronological timeline of key events and developments mentioned in the source material. Include dates (or relative ordering) and brief descriptions for each entry."
      );
    case "mind-map":
      return (
        base +
        `Generate a mind map in Markdown heading format for use with the markmap library.

Rules:
- Use a single # heading for the central topic.
- Use ## for main branches (aim for 4-7 branches).
- Use ### for sub-topics under each branch (2-5 per branch).
- Use #### for further details where appropriate (1-3 per sub-topic).
- Keep each node text concise (max 6-8 words).
- Cover ALL the major concepts from the source material.
- Do NOT include any fenced code blocks, do NOT wrap in backticks.
- Return ONLY the markdown, nothing else.

Example format:
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
        'Generate flashcards as a JSON array with the following structure: [{ "front": "question or term", "back": "answer or definition" }]. Create 15-25 flashcards covering the key concepts. Return ONLY valid JSON, no other text.'
      );
    case "quiz": {
      const count = opts?.questionCount ?? 10;
      return (
        base +
        `Generate a quiz as a JSON array with the following structure: [{ "question": "question text", "options": ["option A", "option B", "option C", "option D"], "answer": 0 }] where answer is the zero-based index of the correct option. Create exactly ${count} questions. Return ONLY valid JSON, no other text.`
      );
    }
    default:
      return (
        base + "Generate a helpful summary and analysis of the source material."
      );
  }
}

export const studioRouter = router({
  list: protectedProcedure
    .input(z.object({ notebookId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertOwnsNotebook(input.notebookId, ctx.user.id);
      return db
        .select()
        .from(studioOutputs)
        .where(eq(studioOutputs.notebookId, input.notebookId))
        .orderBy(desc(studioOutputs.createdAt));
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(studioOutputs)
        .where(eq(studioOutputs.id, input.id))
        .limit(1);
      if (!row) return null;
      await assertOwnsNotebook(row.notebookId, ctx.user.id);
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
    .mutation(async ({ input, ctx }) => {
      await assertOwnsNotebook(input.notebookId, ctx.user.id);

      const title = KIND_TITLES[input.kind] ?? input.kind;

      const [row] = await db
        .insert(studioOutputs)
        .values({
          notebookId: input.notebookId,
          kind: input.kind,
          title,
          status: "generating",
        })
        .returning();

      try {
        let chatModel: Awaited<ReturnType<typeof getChatModel>>;
        try {
          chatModel = await getChatModel(ctx.user.id);
        } catch (err) {
          if (err instanceof NoAiConfigError) {
            throw new Error(
              "Configure a chat provider in Settings before generating studio outputs.",
            );
          }
          throw err;
        }

        const readySources = await db
          .select({ content: sources.content })
          .from(sources)
          .where(
            and(
              eq(sources.notebookId, input.notebookId),
              eq(sources.status, "ready"),
            ),
          );

        let combinedContent = "";
        for (const s of readySources) {
          if (s.content) {
            combinedContent += s.content + "\n\n";
          }
          if (combinedContent.length >= 20000) break;
        }
        combinedContent = combinedContent.slice(0, 20000);

        if (!combinedContent.trim()) {
          throw new Error(
            "No source content available. Add sources to the notebook first.",
          );
        }

        const prompt = buildPrompt(input.kind, combinedContent, {
          questionCount: input.questionCount,
        });

        const { text: generatedText } = await generateText({
          model: chatModel,
          prompt,
        });

        let content: unknown;

        if (input.kind === "mind-map") {
          // Mind map stores markdown for markmap rendering
          const cleaned = generatedText
            .replace(/^```(?:markdown|md)?\s*\n?/i, "")
            .replace(/\n?```\s*$/i, "")
            .trim();
          content = { markdown: cleaned };
        } else if (STRUCTURED_KINDS.has(input.kind)) {
          try {
            // Strip markdown code fences if present
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

        const [updated] = await db
          .update(studioOutputs)
          .set({ content, status: "ready" })
          .where(eq(studioOutputs.id, row.id))
          .returning();

        return updated;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";

        const [updated] = await db
          .update(studioOutputs)
          .set({
            status: "error",
            content: { error: errorMessage },
          })
          .where(eq(studioOutputs.id, row.id))
          .returning();

        return updated;
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(studioOutputs)
        .where(eq(studioOutputs.id, input.id))
        .limit(1);
      if (!row) return null;
      await assertOwnsNotebook(row.notebookId, ctx.user.id);
      await db.delete(studioOutputs).where(eq(studioOutputs.id, input.id));
      return { id: input.id };
    }),
});
