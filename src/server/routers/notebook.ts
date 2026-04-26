import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notebooks } from "@/db/schema";
import { protectedProcedure, router } from "../trpc";

export const notebookRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(notebooks)
      .where(eq(notebooks.userId, ctx.user.id))
      .orderBy(desc(notebooks.createdAt));
  }),
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(notebooks)
        .where(eq(notebooks.id, input.id))
        .limit(1);
      if (!row || row.userId !== ctx.user.id) return null;
      return row;
    }),
  create: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [row] = await db
        .insert(notebooks)
        .values({ ...input, userId: ctx.user.id })
        .returning();
      return row;
    }),
  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().min(1).optional(),
        description: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(notebooks)
        .where(eq(notebooks.id, input.id))
        .limit(1);
      if (!row || row.userId !== ctx.user.id) return null;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined)
        updates.description = input.description;
      const [updated] = await db
        .update(notebooks)
        .set(updates)
        .where(eq(notebooks.id, input.id))
        .returning();
      return updated;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(notebooks)
        .where(eq(notebooks.id, input.id))
        .limit(1);
      if (!row || row.userId !== ctx.user.id) return null;
      await db.delete(notebooks).where(eq(notebooks.id, input.id));
      return { id: input.id };
    }),
});
