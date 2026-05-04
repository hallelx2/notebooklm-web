import {
  ENCRYPTION_KEY_VERSION_CURRENT,
  encryptSecret,
} from "@notebooklm/core/crypto/secret";
import { userProviderCredentials } from "@notebooklm/core/db/schema";
import {
  loadSearchPreferences,
  resolveSearchCredential,
  searchProviderDescriptors,
  setSearchPreferences,
  testSearchProvider,
} from "@notebooklm/core/search";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../context";

/**
 * Web-search provider configuration. Mirrors the shape of the AI
 * `provider` router (encrypted credentials in `userProviderCredentials`,
 * masked echoes back to the client) but with the much simpler descriptor
 * surface (no model catalog, just an apiKey or baseUrl per provider).
 *
 * Per-user enabled-flags + ordering live on `userAiConfig.preferences
 * .search` (jsonb), parsed via `SearchPreferencesSchema`. The runtime's
 * `webSearch()` reads the same slot.
 */

const SEARCH_PROVIDER_NAMES = ["exa", "tavily", "searxng"] as const;
const SearchProviderNameSchema = z.enum(SEARCH_PROVIDER_NAMES);

export const searchConfigRouter = router({
  /**
   * One-shot read for the settings UI: descriptors + per-user
   * credential rows + per-user preferences (order + enabled). Lets the
   * client render the full Web Search tab from a single query.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const prefs = await loadSearchPreferences(ctx.user.id);

    const rows = await ctx.adapter.db
      .select()
      .from(userProviderCredentials)
      .where(eq(userProviderCredentials.userId, ctx.user.id));
    const byProvider = new Map(
      rows
        .filter((r) =>
          (SEARCH_PROVIDER_NAMES as readonly string[]).includes(r.provider),
        )
        .map((r) => [r.provider, r]),
    );

    const providers = SEARCH_PROVIDER_NAMES.map((id) => {
      const desc = searchProviderDescriptors[id];
      const row = byProvider.get(id);
      const hasKey = !!(row?.apiKeyCiphertext && row.apiKeyIv && row.apiKeyTag);
      return {
        id,
        descriptor: desc,
        configured: row
          ? {
              hasKey,
              baseUrl: row.baseUrl,
              maskedKey: hasKey ? "•••••••••" : "",
              validationStatus: row.validationStatus,
              validationError: row.validationError,
              lastValidatedAt: row.lastValidatedAt,
            }
          : null,
        envFallback: {
          apiKey: !!desc.envVars.apiKey && !!process.env[desc.envVars.apiKey],
          baseUrl:
            !!desc.envVars.baseUrl && !!process.env[desc.envVars.baseUrl],
        },
        enabled: prefs.enabled[id] !== false,
      };
    });

    return {
      providers,
      order: prefs.order,
    };
  }),

  /**
   * Insert or update the user's credential for a search provider.
   * Reuses the same encryption pattern AI providers use (AES-GCM with
   * userId as AAD). Empty `apiKey` leaves the saved ciphertext alone —
   * lets the user edit baseUrl without re-entering the secret.
   */
  upsertCredential: protectedProcedure
    .input(
      z.object({
        provider: SearchProviderNameSchema,
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
            // Saving = back to "unknown" until the user hits Test.
            validationStatus: apiKeyFields
              ? "unknown"
              : existing.validationStatus,
            validationError: apiKeyFields ? null : existing.validationError,
          })
          .where(eq(userProviderCredentials.id, existing.id));
        return { ok: true };
      }

      await ctx.adapter.db.insert(userProviderCredentials).values({
        userId: ctx.user.id,
        provider: input.provider,
        label: "default",
        apiKeyCiphertext: apiKeyFields?.apiKeyCiphertext ?? null,
        apiKeyIv: apiKeyFields?.apiKeyIv ?? null,
        apiKeyTag: apiKeyFields?.apiKeyTag ?? null,
        apiKeyKeyVersion:
          apiKeyFields?.apiKeyKeyVersion ?? ENCRYPTION_KEY_VERSION_CURRENT,
        baseUrl: input.baseUrl ?? null,
        validationStatus: "unknown",
      });
      return { ok: true };
    }),

  /** Drop the user's saved credential row for a provider. */
  deleteCredential: protectedProcedure
    .input(z.object({ provider: SearchProviderNameSchema }))
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

  /**
   * Persist the full preference order (top-to-bottom). Always sent as
   * the complete array — server replaces wholesale rather than diffing.
   * The client's drag-and-drop handler can ignore the response and
   * trust optimistic updates; the merged state comes back here for
   * any non-DnD callers (e.g. "Reset to defaults").
   */
  setOrder: protectedProcedure
    .input(z.object({ order: z.array(SearchProviderNameSchema) }))
    .mutation(async ({ input, ctx }) => {
      return setSearchPreferences(ctx.user.id, { order: input.order });
    }),

  /** Toggle a single provider's enabled flag. */
  setEnabled: protectedProcedure
    .input(
      z.object({
        provider: SearchProviderNameSchema,
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const prefs = await loadSearchPreferences(ctx.user.id);
      return setSearchPreferences(ctx.user.id, {
        enabled: { ...prefs.enabled, [input.provider]: input.enabled },
      });
    }),

  /**
   * Run a `limit=1` query through the named provider with either:
   *   (a) draft credentials sent in the input — for testing a key
   *       before saving, OR
   *   (b) the user's saved credentials (env fallback included) when
   *       no draft is present — for re-testing an already-saved row.
   *
   * Returns latency + a sample result, or the error string. Never
   * throws — `testSearchProvider` wraps internal failures so the UI
   * can render a friendly message without try/catch.
   */
  testConnection: protectedProcedure
    .input(
      z.object({
        provider: SearchProviderNameSchema,
        apiKey: z.string().optional(),
        baseUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const draft = !!(input.apiKey || input.baseUrl);
      const creds = draft
        ? { apiKey: input.apiKey, baseUrl: input.baseUrl }
        : await resolveSearchCredential(ctx.user.id, input.provider);

      return testSearchProvider(input.provider, creds);
    }),
});
