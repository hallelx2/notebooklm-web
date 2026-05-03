import { eq } from "drizzle-orm";
import { loadRuntimesForTask, runAgent } from "../agent";
import { NoAiConfigError } from "../ai/factory";
import { notebooks } from "../db/schema";
import { coreDb } from "../runtime";

const DEFAULT_TITLES = new Set(["Untitled notebook", "Untitled"]);

/**
 * Best-effort: if the notebook still has the default title or no description,
 * ask the user's configured chat model to suggest something based on the
 * first source's text. Silent on any failure -- this is a UX nicety, not a
 * critical path.
 *
 * Routes through the agent harness with `kind: "studio", outputKind:
 * "auto-title"`. The runtime adapter (`ai-sdk/index.ts -> runAutoTitle`)
 * runs the same two `generateText` calls as the pre-harness helper and
 * yields a `structured: { title?, description? }` event we read off the
 * stream. DB read/write of the notebook row stays here because that's
 * orchestration, not an LLM call.
 */
export async function maybeAutoTitleAndSummarize(
  userId: string,
  notebookId: string,
  sourcePreview: string,
) {
  const db = coreDb();
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

  let result: { title?: string; description?: string } = {};
  try {
    const runtimes = await loadRuntimesForTask(userId, "studio");
    for await (const ev of runAgent(
      {
        kind: "studio",
        userId,
        notebookId,
        outputKind: "auto-title",
        opts: { excerpt, needsTitle, needsDescription },
      },
      runtimes,
      { userId },
    )) {
      if (ev.type === "structured") {
        result = ev.data as { title?: string; description?: string };
      }
    }
  } catch (err) {
    // User hasn't configured a chat provider yet -- skip auto-titling.
    if (err instanceof NoAiConfigError) return;
    console.warn("auto-title: runAgent failed", err);
    return;
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (needsTitle && result.title) updates.title = result.title;
  if (needsDescription && result.description)
    updates.description = result.description;

  if (Object.keys(updates).length > 1) {
    await db.update(notebooks).set(updates).where(eq(notebooks.id, notebookId));
  }
}

/** @deprecated Use `maybeAutoTitleAndSummarize` instead. */
export const maybeAutoTitleNotebook = maybeAutoTitleAndSummarize;
