import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { notebooks, sources } from "@/db/schema";
import { ingestFile, ingestLink } from "@/lib/ingest";
import { getStorage } from "@/lib/storage";
import { protectedProcedure, router } from "../trpc";

async function assertOwns(notebookId: string, userId: string) {
  const [nb] = await db
    .select()
    .from(notebooks)
    .where(and(eq(notebooks.id, notebookId), eq(notebooks.userId, userId)))
    .limit(1);
  if (!nb) throw new Error("Notebook not found");
  return nb;
}

export const sourceRouter = router({
  list: protectedProcedure
    .input(z.object({ notebookId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertOwns(input.notebookId, ctx.user.id);
      return db
        .select()
        .from(sources)
        .where(eq(sources.notebookId, input.notebookId))
        .orderBy(desc(sources.createdAt));
    }),

  addLink: protectedProcedure
    .input(
      z.object({
        notebookId: z.string().uuid(),
        url: z.string().url(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await assertOwns(input.notebookId, ctx.user.id);
      const [row] = await db
        .insert(sources)
        .values({
          notebookId: input.notebookId,
          kind: "link",
          title: input.url,
          uri: input.url,
          status: "pending",
        })
        .returning();
      ingestLink({
        sourceId: row.id,
        notebookId: input.notebookId,
        url: input.url,
      }).catch((err) => console.error("ingestLink failed", err));
      return row;
    }),

  addFromUrl: protectedProcedure
    .input(
      z.object({
        notebookId: z.string().uuid(),
        url: z.string().url(),
        title: z.string().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await assertOwns(input.notebookId, ctx.user.id);
      const [row] = await db
        .insert(sources)
        .values({
          notebookId: input.notebookId,
          kind: "link",
          title: input.title ?? input.url,
          uri: input.url,
          status: "pending",
        })
        .returning();
      ingestLink({
        sourceId: row.id,
        notebookId: input.notebookId,
        url: input.url,
      }).catch((err) => console.error("ingestLink failed", err));
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [row] = await db
        .select()
        .from(sources)
        .where(eq(sources.id, input.id))
        .limit(1);
      if (!row) return null;
      await assertOwns(row.notebookId, ctx.user.id);
      if (row.storageKey) {
        try {
          await getStorage(
            row.storageProvider as Parameters<typeof getStorage>[0],
          ).delete(row.storageKey);
        } catch (err) {
          console.warn("storage delete failed", err);
        }
      }
      await db.delete(sources).where(eq(sources.id, input.id));
      return { id: input.id };
    }),
});

export async function createSourceForUpload(params: {
  notebookId: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  storageProvider: string;
  storageKey: string;
}) {
  await assertOwns(params.notebookId, params.userId);
  const [row] = await db
    .insert(sources)
    .values({
      notebookId: params.notebookId,
      kind: "file",
      title: params.filename,
      mimeType: params.mimeType,
      size: params.size,
      storageProvider: params.storageProvider,
      storageKey: params.storageKey,
      status: "pending",
    })
    .returning();
  ingestFile({
    sourceId: row.id,
    notebookId: params.notebookId,
    buffer: Buffer.alloc(0), // set by upload route
    mimeType: params.mimeType,
    filename: params.filename,
  }).catch(() => {});
  return row;
}
