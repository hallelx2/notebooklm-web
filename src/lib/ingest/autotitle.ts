import "server-only";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notebooks } from "@/db/schema";
import { getChatModel, NoAiConfigError } from "@/lib/ai/factory";

const DEFAULT_TITLES = new Set(["Untitled notebook", "Untitled"]);

/**
 * Best-effort: if the notebook still has the default title or no description,
 * ask the user's configured chat model to suggest something based on the
 * first source's text. Silent on any failure -- this is a UX nicety, not a
 * critical path.
 */
export async function maybeAutoTitleAndSummarize(
  userId: string,
  notebookId: string,
  sourcePreview: string,
) {
  const [nb] = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.id, notebookId))
    .limit(1);
  if (!nb) return;

  const needsTitle = DEFAULT_TITLES.has(nb.title);
  const needsDescription = !nb.description || nb.description.trim() === "";

  if (!needsTitle && !needsDescription) return;

  const excerpt = sourcePreview.replace(/\s+/g, " ").trim().slice(0, 3000);
  if (!excerpt) return;

  let model: Awaited<ReturnType<typeof getChatModel>>;
  try {
    model = await getChatModel(userId);
  } catch (err) {
    // User hasn't configured a chat provider yet -- skip auto-titling.
    if (err instanceof NoAiConfigError) return;
    console.warn("auto-title: getChatModel failed", err);
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (needsTitle) {
    try {
      const { text } = await generateText({
        model,
        system:
          "You generate concise notebook titles (3 to 6 words). Respond with only the title text -- no quotes, no punctuation at the end, no prefix like 'Title:'.",
        prompt: `Suggest a notebook title for a workspace whose first source begins with:\n\n${excerpt}`,
      });
      const title = text
        .split("\n")[0]
        .replace(/^["']|["']$/g, "")
        .replace(/\.$/, "")
        .trim()
        .slice(0, 80);
      if (title) updates.title = title;
    } catch (err) {
      console.warn("auto-title failed", err);
    }
  }

  if (needsDescription) {
    try {
      const { text } = await generateText({
        model,
        system:
          "You generate concise notebook summaries (2 to 3 sentences). Describe what the source material covers and its key topics. Respond with only the summary text -- no quotes, no prefix like 'Summary:'.",
        prompt: `Write a 2-3 sentence summary for a notebook whose first source begins with:\n\n${excerpt}`,
      });
      const description = text
        .replace(/^["']|["']$/g, "")
        .trim()
        .slice(0, 500);
      if (description) updates.description = description;
    } catch (err) {
      console.warn("auto-summarize failed", err);
    }
  }

  if (Object.keys(updates).length > 1) {
    await db.update(notebooks).set(updates).where(eq(notebooks.id, notebookId));
  }
}

/** @deprecated Use `maybeAutoTitleAndSummarize` instead. */
export const maybeAutoTitleNotebook = maybeAutoTitleAndSummarize;
