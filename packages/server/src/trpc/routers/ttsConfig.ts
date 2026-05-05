import {
  ENCRYPTION_KEY_VERSION_CURRENT,
  encryptSecret,
  maskApiKey,
} from "@notebooklm/core/crypto/secret";
import { userProviderCredentials } from "@notebooklm/core/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../context";

/**
 * Per-user TTS credential management. Surface for now is just
 * Deepgram — Kokoro local needs no key, Kokoro-FastAPI uses a
 * base URL not a key, and other TTS providers (ElevenLabs etc.)
 * aren't wired yet.
 *
 * Mirrors the `searchConfig` router shape: encrypted API key in
 * `userProviderCredentials` (the same table the AI providers use),
 * masked echoes back to the client. The audio handler reads the
 * saved key via `core/tts/credentials.ts → resolveTtsCredential`.
 */

const TTS_PROVIDER_NAMES = ["deepgram"] as const;
const TtsProviderNameSchema = z.enum(TTS_PROVIDER_NAMES);

const MaskedTtsCredential = z.object({
  provider: z.string(),
  hasKey: z.boolean(),
  maskedKey: z.string(),
  baseUrl: z.string().nullable(),
  lastValidatedAt: z.date().nullable(),
});

export const ttsConfigRouter = router({
  /** List the user's saved TTS credentials (masked). */
  list: protectedProcedure
    .output(z.array(MaskedTtsCredential))
    .query(async ({ ctx }) => {
      const rows = await ctx.adapter.db
        .select()
        .from(userProviderCredentials)
        .where(eq(userProviderCredentials.userId, ctx.user.id));
      return rows
        .filter((r) =>
          (TTS_PROVIDER_NAMES as readonly string[]).includes(r.provider),
        )
        .map((r) => ({
          provider: r.provider,
          hasKey: !!(r.apiKeyCiphertext && r.apiKeyIv && r.apiKeyTag),
          maskedKey:
            r.apiKeyCiphertext && r.apiKeyIv && r.apiKeyTag
              ? maskApiKey("•••••••••")
              : "",
          baseUrl: r.baseUrl,
          lastValidatedAt: r.lastValidatedAt,
        }));
    }),

  /** Insert/update the saved key for a TTS provider. */
  upsertCredential: protectedProcedure
    .input(
      z.object({
        provider: TtsProviderNameSchema,
        apiKey: z.string().optional(),
        baseUrl: z.string().url().optional().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
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

      const [existing] = await ctx.adapter.db
        .select()
        .from(userProviderCredentials)
        .where(
          and(
            eq(userProviderCredentials.userId, ctx.user.id),
            eq(userProviderCredentials.provider, input.provider),
          ),
        )
        .limit(1);

      if (existing) {
        await ctx.adapter.db
          .update(userProviderCredentials)
          .set({
            ...(apiKeyFields ?? {}),
            baseUrl: input.baseUrl ?? existing.baseUrl,
            updatedAt: new Date(),
          })
          .where(eq(userProviderCredentials.id, existing.id));
      } else {
        await ctx.adapter.db.insert(userProviderCredentials).values({
          userId: ctx.user.id,
          provider: input.provider,
          label: "default",
          apiKeyCiphertext: apiKeyFields?.apiKeyCiphertext,
          apiKeyIv: apiKeyFields?.apiKeyIv,
          apiKeyTag: apiKeyFields?.apiKeyTag,
          apiKeyKeyVersion:
            apiKeyFields?.apiKeyKeyVersion ?? ENCRYPTION_KEY_VERSION_CURRENT,
          baseUrl: input.baseUrl ?? null,
        });
      }
      return { ok: true };
    }),

  /** Drop the saved credential for a provider. */
  deleteCredential: protectedProcedure
    .input(z.object({ provider: TtsProviderNameSchema }))
    .mutation(async ({ input, ctx }) => {
      await ctx.adapter.db
        .delete(userProviderCredentials)
        .where(
          and(
            eq(userProviderCredentials.userId, ctx.user.id),
            eq(userProviderCredentials.provider, input.provider),
          ),
        );
      return { ok: true };
    }),
});
