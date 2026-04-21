import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { messages, notebooks } from "@/db/schema";
import { protectedProcedure, router } from "../trpc";

async function assertOwns(notebookId: string, userId: string) {
  const [nb] = await db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)))
    .limit(1);
  if (!nb) throw new Error("Notebook not found");
}

export const messageRouter = router({
  list: protectedProcedure
    .input(z.object({ notebookId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertOwns(input.notebookId, ctx.user.id);
      return db
        .select()
        .from(messages)
        .where(eq(messages.notebookId, input.notebookId))
        .orderBy(desc(messages.createdAt))
        .limit(100);
    }),
});
