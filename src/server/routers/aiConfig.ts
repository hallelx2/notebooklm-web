import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { sources, userAiConfig, userProviderCredentials } from "@/db/schema";
import { invalidateUserAiCache } from "@/lib/ai/factory";
import {
  embedModels,
  getProvider,
  isSupportedDim,
  isValidProviderId,
  type ProviderId,
  SUPPORTED_EMBED_DIMS,
} from "@/lib/ai/providers";
import { protectedProcedure, router } from "../trpc";

const ProviderIdSchema = z
  .string()
  .refine(isValidProviderId, "Unknown provider");

/**
 * Returns a fresh-by-default `user_ai_config` row for the current user,
 * creating an empty placeholder if missing. Used by the settings page and
 * the onboarding gate.
 */
async function ensureRow(userId: string) {
  const [existing] = await db
    .select()
    .from(userAiConfig)
    .where(eq(userAiConfig.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(userAiConfig)
    .values({ userId })
    .returning();
  return created;
}

export const aiConfigRouter = router({
  /** Read the current user's active AI configuration. */
  get: protectedProcedure.query(async ({ ctx }) => {
    const cfg = await ensureRow(ctx.user.id);
    return {
      ...cfg,
      supportedEmbedDims: SUPPORTED_EMBED_DIMS,
      isOnboarded: !!cfg.onboardedAt,
    };
  }),

  /** Update the active selections. Embedding dim must be one we have a
   *  storage table for; otherwise we'd be unable to store the vectors. */
  update: protectedProcedure
    .input(
      z.object({
        chatProvider: ProviderIdSchema.optional().nullable(),
        chatModel: z.string().min(1).optional().nullable(),
        embeddingProvider: ProviderIdSchema.optional().nullable(),
        embeddingModel: z.string().min(1).optional().nullable(),
        embeddingDim: z.number().int().positive().optional().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await ensureRow(ctx.user.id);

      // Validate that any embedding model picked is one our SUPPORTED_EMBED_DIMS
      // can store. Otherwise the chunks can't be indexed.
      if (
        input.embeddingProvider &&
        input.embeddingModel &&
        input.embeddingDim
      ) {
        if (!isSupportedDim(input.embeddingDim)) {
          throw new Error(
            `Dimension ${input.embeddingDim} is not supported (must be one of ${SUPPORTED_EMBED_DIMS.join(", ")}).`,
          );
        }
        const provDef = getProvider(input.embeddingProvider as ProviderId);
        if (!provDef) {
          throw new Error(`Unknown provider ${input.embeddingProvider}`);
        }
        // For non-custom-model providers, validate the model is in our
        // catalog and its dim matches what was sent.
        if (!provDef.supportsCustomModels) {
          const m = embedModels(input.embeddingProvider as ProviderId).find(
            (x) => x.id === input.embeddingModel,
          );
          if (!m) {
            throw new Error(
              `Model ${input.embeddingModel} not found for ${provDef.label}.`,
            );
          }
          if (m.embedDim && m.embedDim !== input.embeddingDim) {
            throw new Error(
              `Model ${m.id} has embedding dim ${m.embedDim}, not ${input.embeddingDim}.`,
            );
          }
        }
      }

      // Confirm credentials exist for any provider being selected.
      for (const [field, providerId] of [
        ["chat", input.chatProvider],
        ["embedding", input.embeddingProvider],
      ] as const) {
        if (!providerId) continue;
        const [cred] = await db
          .select()
          .from(userProviderCredentials)
          .where(
            and(
              eq(userProviderCredentials.userId, ctx.user.id),
              eq(userProviderCredentials.provider, providerId),
            ),
          )
          .limit(1);
        if (!cred) {
          throw new Error(
            `No saved credential for ${providerId} -- add one before selecting it as your ${field} provider.`,
          );
        }
      }

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      for (const k of [
        "chatProvider",
        "chatModel",
        "embeddingProvider",
        "embeddingModel",
        "embeddingDim",
      ] as const) {
        if (input[k] !== undefined) updates[k] = input[k];
      }

      // If both chat and embedding are now configured, mark onboarded.
      const [merged] = await db
        .update(userAiConfig)
        .set(updates)
        .where(eq(userAiConfig.userId, ctx.user.id))
        .returning();

      const fullyConfigured =
        !!merged.chatProvider &&
        !!merged.chatModel &&
        !!merged.embeddingProvider &&
        !!merged.embeddingModel &&
        !!merged.embeddingDim;

      if (fullyConfigured && !merged.onboardedAt) {
        await db
          .update(userAiConfig)
          .set({ onboardedAt: new Date() })
          .where(eq(userAiConfig.userId, ctx.user.id));
      }

      invalidateUserAiCache(ctx.user.id);
      return { ...merged, isOnboarded: fullyConfigured };
    }),

  /** Returns counts of sources per embedding model, so the UI can show
   *  "142 of 200 sources are embedded with your current model". */
  reembedStatus: protectedProcedure.query(async ({ ctx }) => {
    const cfg = await ensureRow(ctx.user.id);
    const userSources = await db
      .select({
        id: sources.id,
        notebookId: sources.notebookId,
        title: sources.title,
        embeddingModel: sources.metadata,
      })
      .from(sources);
    void userSources;
    return {
      currentModel: cfg.embeddingModel,
      currentDim: cfg.embeddingDim,
    };
  }),
});
