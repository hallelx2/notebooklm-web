import { notebooks, sources } from "@notebooklm/core/db/schema";
import { ingestFile, ingestLink } from "@notebooklm/core/ingest";
import { ingestText } from "@notebooklm/core/ingest/text";
import { getStorage } from "@notebooklm/core/storage";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { PlatformAdapter } from "../../adapter";
import { protectedProcedure, router } from "../context";
import {
  IdResultSchema,
  NullableIdResultSchema,
  SourceSchema,
} from "../schemas";

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
  return nb;
}

export const sourceRouter = router({
  list: protectedProcedure
    .input(z.object({ notebookId: z.string().uuid() }))
    .output(z.array(SourceSchema))
    .query(async ({ input, ctx }) => {
      await assertOwns(ctx.adapter, input.notebookId, ctx.user.id);
      return ctx.adapter.db
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
    .output(SourceSchema)
    .mutation(async ({ input, ctx }) => {
      await assertOwns(ctx.adapter, input.notebookId, ctx.user.id);
      const [row] = await ctx.adapter.db
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
        userId: ctx.user.id,
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
    .output(SourceSchema)
    .mutation(async ({ input, ctx }) => {
      await assertOwns(ctx.adapter, input.notebookId, ctx.user.id);
      const [row] = await ctx.adapter.db
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
        userId: ctx.user.id,
        sourceId: row.id,
        notebookId: input.notebookId,
        url: input.url,
      }).catch((err) => console.error("ingestLink failed", err));
      return row;
    }),

  addFromText: protectedProcedure
    .input(
      z.object({
        notebookId: z.string().uuid(),
        title: z.string().min(1),
        text: z.string().min(1),
        kind: z.enum(["text", "note"]).optional().default("text"),
      }),
    )
    .output(SourceSchema)
    .mutation(async ({ input, ctx }) => {
      await assertOwns(ctx.adapter, input.notebookId, ctx.user.id);
      const [row] = await ctx.adapter.db
        .insert(sources)
        .values({
          notebookId: input.notebookId,
          kind: input.kind,
          title: input.title,
          content: input.text.slice(0, 20000),
          status: "pending",
        })
        .returning();
      ingestText({
        userId: ctx.user.id,
        sourceId: row.id,
        notebookId: input.notebookId,
        text: input.text,
        sourceTitle: input.title,
      }).catch((err) => console.error("ingestText failed", err));
      return row;
    }),

  retry: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(z.union([SourceSchema, IdResultSchema, z.null()]))
    .mutation(async ({ input, ctx }) => {
      const [row] = await ctx.adapter.db
        .select()
        .from(sources)
        .where(eq(sources.id, input.id))
        .limit(1);
      if (!row) return null;
      await assertOwns(ctx.adapter, row.notebookId, ctx.user.id);
      if (row.status !== "error") return row;

      // Reset status to pending
      await ctx.adapter.db
        .update(sources)
        .set({ status: "pending", error: null, updatedAt: new Date() })
        .where(eq(sources.id, input.id));

      // Re-trigger ingestion
      if (row.kind === "link" && row.uri) {
        ingestLink({
          userId: ctx.user.id,
          sourceId: row.id,
          notebookId: row.notebookId,
          url: row.uri,
        }).catch((err) => console.error("retry ingestLink failed", err));
      } else if (row.kind === "file" && row.storageKey) {
        // For files we'd need the buffer again — just re-parse from storage
        // For now, mark as pending and let it try
        ingestFile({
          userId: ctx.user.id,
          sourceId: row.id,
          notebookId: row.notebookId,
          buffer: Buffer.alloc(0),
          mimeType: row.mimeType,
          filename: row.title,
        }).catch((err) => console.error("retry ingestFile failed", err));
      }

      return { id: input.id };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .output(NullableIdResultSchema)
    .mutation(async ({ input, ctx }) => {
      const [row] = await ctx.adapter.db
        .select()
        .from(sources)
        .where(eq(sources.id, input.id))
        .limit(1);
      if (!row) return null;
      await assertOwns(ctx.adapter, row.notebookId, ctx.user.id);
      if (row.storageKey) {
        try {
          await getStorage(
            row.storageProvider as Parameters<typeof getStorage>[0],
          ).delete(row.storageKey);
        } catch (err) {
          console.warn("storage delete failed", err);
        }
      }
      await ctx.adapter.db.delete(sources).where(eq(sources.id, input.id));
      return { id: input.id };
    }),
});

export async function createSourceForUpload(
  adapter: PlatformAdapter,
  params: {
    notebookId: string;
    userId: string;
    filename: string;
    mimeType: string;
    size: number;
    storageProvider: string;
    storageKey: string;
  },
) {
  await assertOwns(adapter, params.notebookId, params.userId);
  const [row] = await adapter.db
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
    userId: params.userId,
    sourceId: row.id,
    notebookId: params.notebookId,
    buffer: Buffer.alloc(0), // set by upload route
    mimeType: params.mimeType,
    filename: params.filename,
  }).catch(() => {});
  return row;
}
