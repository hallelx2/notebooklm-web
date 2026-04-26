import { generateText } from "ai";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userProviderCredentials } from "@/db/schema";
import {
  buildChatModelFromParams,
  buildEmbedHandleFromParams,
  invalidateUserAiCache,
} from "@/lib/ai/factory";
import {
  getProvider,
  isValidProviderId,
  PROVIDERS,
  type ProviderId,
} from "@/lib/ai/providers";
import {
  ENCRYPTION_KEY_VERSION_CURRENT,
  encryptSecret,
  maskApiKey,
} from "@/lib/crypto/secret";
import { protectedProcedure, router } from "../trpc";

/**
 * Routers for managing the user's saved provider credentials and the
 * "Test connection" flow on the settings page. All keys are encrypted at
 * rest with the user's ID as AAD.
 */

const ProviderIdSchema = z
  .string()
  .refine(isValidProviderId, "Unknown provider");

function maskedRow(row: typeof userProviderCredentials.$inferSelect) {
  // Never return ciphertext to the client. The "key" field shown in the UI
  // is just a hint that something is saved -- it's a masked echo.
  const hasKey = !!(row.apiKeyCiphertext && row.apiKeyIv && row.apiKeyTag);
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    hasKey,
    maskedKey: hasKey ? maskApiKey("•••••••••") : "",
    baseUrl: row.baseUrl,
    organization: row.organization,
    lastValidatedAt: row.lastValidatedAt,
    validationStatus: row.validationStatus,
    validationError: row.validationError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const providerRouter = router({
  /** List all available providers + their model catalogs (static registry). */
  catalog: protectedProcedure.query(() => {
    return PROVIDERS.map((p) => ({
      id: p.id,
      label: p.label,
      logo: p.logo,
      authType: p.authType,
      baseUrlRequired: p.baseUrlRequired,
      baseUrlPlaceholder: p.baseUrlPlaceholder,
      defaultBaseUrl: p.defaultBaseUrl,
      apiKeyDocsUrl: p.apiKeyDocsUrl,
      supportsCustomModels: p.supportsCustomModels ?? false,
      selfHostedOnly: p.selfHostedOnly ?? false,
      models: p.models,
    }));
  }),

  /** List the user's saved credentials (masked -- never returns plaintext). */
  list: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(userProviderCredentials)
      .where(eq(userProviderCredentials.userId, ctx.user.id))
      .orderBy(desc(userProviderCredentials.updatedAt));
    return rows.map(maskedRow);
  }),

  /** Insert or update a credential. Re-saves the encrypted API key. */
  upsert: protectedProcedure
    .input(
      z.object({
        provider: ProviderIdSchema,
        label: z.string().min(1).default("default"),
        apiKey: z.string().optional(),
        baseUrl: z.string().url().optional().nullable(),
        organization: z.string().optional().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const provider = input.provider as ProviderId;
      const def = getProvider(provider);
      if (!def) throw new Error(`Unknown provider ${input.provider}`);

      // Validate base URL requirement.
      if (def.baseUrlRequired && !input.baseUrl) {
        throw new Error(
          `${def.label} requires a base URL (e.g. ${def.baseUrlPlaceholder ?? "https://..."}).`,
        );
      }

      // Encrypt the API key if provided. If the user is editing an existing
      // credential and didn't re-enter the key, leave the old ciphertext.
      let apiKeyFields: {
        apiKeyCiphertext: string;
        apiKeyIv: string;
        apiKeyTag: string;
        apiKeyKeyVersion: number;
      } | null = null;

      if (input.apiKey && input.apiKey.trim().length > 0) {
        const enc = encryptSecret(input.apiKey.trim(), ctx.user.id);
        apiKeyFields = {
          apiKeyCiphertext: enc.ciphertext.toString("base64"),
          apiKeyIv: enc.iv.toString("base64"),
          apiKeyTag: enc.tag.toString("base64"),
          apiKeyKeyVersion: enc.keyVersion,
        };
      }

      // Look up an existing row matching (userId, provider, label) so we can
      // upsert idempotently.
      const [existing] = await db
        .select()
        .from(userProviderCredentials)
        .where(
          and(
            eq(userProviderCredentials.userId, ctx.user.id),
            eq(userProviderCredentials.provider, provider),
            eq(userProviderCredentials.label, input.label),
          ),
        )
        .limit(1);

      const baseUrl = input.baseUrl ?? def.defaultBaseUrl ?? null;

      if (existing) {
        const [updated] = await db
          .update(userProviderCredentials)
          .set({
            ...(apiKeyFields ?? {}),
            baseUrl,
            organization: input.organization ?? null,
            updatedAt: new Date(),
            // Saving = back to "unknown" until they hit Test.
            validationStatus: apiKeyFields
              ? "unknown"
              : existing.validationStatus,
            validationError: apiKeyFields ? null : existing.validationError,
          })
          .where(eq(userProviderCredentials.id, existing.id))
          .returning();
        invalidateUserAiCache(ctx.user.id);
        return maskedRow(updated);
      }

      if (!apiKeyFields && def.authType !== "base_url_only") {
        throw new Error(`${def.label} requires an API key.`);
      }

      const [created] = await db
        .insert(userProviderCredentials)
        .values({
          userId: ctx.user.id,
          provider,
          label: input.label,
          apiKeyCiphertext: apiKeyFields?.apiKeyCiphertext ?? null,
          apiKeyIv: apiKeyFields?.apiKeyIv ?? null,
          apiKeyTag: apiKeyFields?.apiKeyTag ?? null,
          apiKeyKeyVersion:
            apiKeyFields?.apiKeyKeyVersion ?? ENCRYPTION_KEY_VERSION_CURRENT,
          baseUrl,
          organization: input.organization ?? null,
          validationStatus: "unknown",
        })
        .returning();
      invalidateUserAiCache(ctx.user.id);
      return maskedRow(created);
    }),

  /** Test a connection. Either tests an existing saved credential by id,
   *  or tests a draft (new credential before save). Updates validation_status
   *  on the saved row. */
  test: protectedProcedure
    .input(
      z.object({
        // For testing a draft credential (new, not yet saved):
        provider: ProviderIdSchema.optional(),
        apiKey: z.string().optional(),
        baseUrl: z.string().url().optional(),
        // For testing a saved credential:
        credentialId: z.string().uuid().optional(),
        // What to test:
        kind: z.enum(["chat", "embed"]),
        model: z.string().min(1),
        dim: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      // Resolve the credential to test.
      let provider: ProviderId;
      let apiKey: string | undefined;
      let baseUrl: string | null;
      let savedRowId: string | null = null;

      if (input.credentialId) {
        const [row] = await db
          .select()
          .from(userProviderCredentials)
          .where(
            and(
              eq(userProviderCredentials.id, input.credentialId),
              eq(userProviderCredentials.userId, ctx.user.id),
            ),
          )
          .limit(1);
        if (!row) throw new Error("Credential not found");
        provider = row.provider as ProviderId;
        baseUrl = row.baseUrl;
        savedRowId = row.id;
        if (row.apiKeyCiphertext && row.apiKeyIv && row.apiKeyTag) {
          const { decryptSecret } = await import("@/lib/crypto/secret");
          apiKey = decryptSecret(
            {
              ciphertext: Buffer.from(row.apiKeyCiphertext, "base64"),
              iv: Buffer.from(row.apiKeyIv, "base64"),
              tag: Buffer.from(row.apiKeyTag, "base64"),
              keyVersion: row.apiKeyKeyVersion,
            },
            ctx.user.id,
          );
        }
      } else {
        if (!input.provider) {
          throw new Error("provider or credentialId required");
        }
        provider = input.provider as ProviderId;
        apiKey = input.apiKey;
        baseUrl = input.baseUrl ?? null;
      }

      const start = Date.now();
      try {
        if (input.kind === "embed") {
          if (!input.dim) throw new Error("`dim` required for embed test");
          const handle = buildEmbedHandleFromParams({
            provider,
            model: input.model,
            dim: input.dim,
            apiKey,
            baseUrl,
          });
          const vecs = await handle.embed(["connection test"]);
          if (!vecs[0] || vecs[0].length !== input.dim) {
            throw new Error(
              `Returned vector has dim ${vecs[0]?.length}, expected ${input.dim}`,
            );
          }
        } else {
          const model = buildChatModelFromParams({
            provider,
            model: input.model,
            apiKey,
            baseUrl,
          });
          // generateText with maxTokens=1 to keep it cheap. Some providers
          // ignore this hint but we still pay only for one or two tokens.
          await generateText({
            model,
            prompt: "ping",
          });
        }

        const latencyMs = Date.now() - start;

        if (savedRowId) {
          await db
            .update(userProviderCredentials)
            .set({
              validationStatus: "ok",
              validationError: null,
              lastValidatedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(userProviderCredentials.id, savedRowId));
        }

        return { ok: true as const, latencyMs };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (savedRowId) {
          await db
            .update(userProviderCredentials)
            .set({
              validationStatus: "invalid",
              validationError: message.slice(0, 500),
              lastValidatedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(userProviderCredentials.id, savedRowId));
        }
        return { ok: false as const, error: message };
      }
    }),

  /** Delete a saved credential. */
  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(userProviderCredentials)
        .where(
          and(
            eq(userProviderCredentials.id, input.id),
            eq(userProviderCredentials.userId, ctx.user.id),
          ),
        );
      invalidateUserAiCache(ctx.user.id);
      return { id: input.id };
    }),
});
