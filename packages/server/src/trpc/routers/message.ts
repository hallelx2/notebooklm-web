import { messages, notebooks } from "@notebooklm/core/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../../adapter";
import { protectedProcedure, router } from "../context";
import { MessageSchema } from "../schemas";

async function assertOwns(
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
}

export const messageRouter = router({
  list: protectedProcedure
    .input(z.object({ notebookId: z.string().uuid() }))
    .output(z.array(MessageSchema))
    .query(async ({ input, ctx }) => {
      await assertOwns(ctx.adapter, input.notebookId, ctx.user.id);
      return ctx.adapter.db
        .select()
        .from(messages)
        .where(eq(messages.notebookId, input.notebookId))
        .orderBy(desc(messages.createdAt))
        .limit(100);
    }),
});
