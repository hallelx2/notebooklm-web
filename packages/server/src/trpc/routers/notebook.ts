import { notebooks } from "@notebooklm/core/db/schema";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../context";
import {
  IdResultSchema,
  NotebookSchema,
  NullableIdResultSchema,
} from "../schemas";

export const notebookRouter = router({
  list: protectedProcedure
    .output(z.array(NotebookSchema))
    .query(async ({ ctx }) => {
      return ctx.adapter.db
        .select()
        .from(notebooks)
        .where(eq(notebooks.userId, ctx.user.id))
        .orderBy(desc(notebooks.createdAt));
    }),
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(NotebookSchema.nullable())
    .query(async ({ input, ctx }) => {
      const [row] = await ctx.adapter.db
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
    .output(NotebookSchema)
    .mutation(async ({ input, ctx }) => {
      const [row] = await ctx.adapter.db
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
    .output(NotebookSchema.nullable())
    .mutation(async ({ input, ctx }) => {
      const [row] = await ctx.adapter.db
        .select()
        .from(notebooks)
        .where(eq(notebooks.id, input.id))
        .limit(1);
      if (!row || row.userId !== ctx.user.id) return null;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined)
        updates.description = input.description;
      const [updated] = await ctx.adapter.db
        .update(notebooks)
        .set(updates)
        .where(eq(notebooks.id, input.id))
        .returning();
      return updated;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(NullableIdResultSchema)
    .mutation(async ({ input, ctx }) => {
      const [row] = await ctx.adapter.db
        .select()
        .from(notebooks)
        .where(eq(notebooks.id, input.id))
        .limit(1);
      if (!row || row.userId !== ctx.user.id) return null;
      await ctx.adapter.db.delete(notebooks).where(eq(notebooks.id, input.id));
      return { id: input.id };
    }),
});

// Suppress unused-import in transient builds.
void IdResultSchema;
