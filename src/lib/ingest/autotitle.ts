import "server-only";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { notebooks } from "@/db/schema";

const DEFAULT_TITLES = new Set(["Untitled notebook", "Untitled"]);

export async function maybeAutoTitleNotebook(
  notebookId: string,
  sourcePreview: string,
) {
  const [nb] = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.id, notebookId))
    .limit(1);
  if (!nb) return;
  if (!DEFAULT_TITLES.has(nb.title)) return;

  const excerpt = sourcePreview.replace(/\s+/g, " ").trim().slice(0, 3000);
  if (!excerpt) return;

  try {
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      system:
        "You generate concise notebook titles (3 to 6 words). Respond with only the title text — no quotes, no punctuation at the end, no prefix like 'Title:'.",
      prompt: `Suggest a notebook title for a workspace whose first source begins with:\n\n${excerpt}`,
    });
    const title = text
      .split("\n")[0]
      .replace(/^["']|["']$/g, "")
      .replace(/\.$/, "")
      .trim()
      .slice(0, 80);
    if (!title) return;
    await db
      .update(notebooks)
      .set({ title, updatedAt: new Date() })
      .where(eq(notebooks.id, notebookId));
  } catch (err) {
    console.warn("auto-title failed", err);
  }
}
