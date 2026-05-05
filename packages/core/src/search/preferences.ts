import { eq } from "drizzle-orm";
import { z } from "zod";
import { userAiConfig } from "../db/schema";
import { coreDb } from "../runtime";
import { isSearchProviderAvailable } from "./credentials";
import type { SearchProviderName } from "./types";

/**
 * Per-user web-search preferences. Persisted as the `search` slot of
 * `userAiConfig.preferences` (jsonb — no schema migration; same column
 * the agent harness already uses for its `chat/rerank/research/studio`
 * runtime preferences). The settings UI writes here; `webSearch()`
 * reads here.
 *
 * Two independent dimensions:
 *
 * - **`order`** — the preference order the user wants. webSearch walks
 *   it top-to-bottom; the first available + enabled provider that
 *   returns results wins.
 *
 * - **`enabled`** — boolean toggle per provider. Lets the user keep an
 *   API key saved in `userProviderCredentials` but temporarily exclude
 *   the provider from runs (e.g. they've burnt their Tavily quota for
 *   the month and want to fall through to SearxNG without deleting the
 *   key). Default behaviour is enabled — only `false` excludes.
 */
/**
 * Defaults are tuned for the desktop installer flow: Tavily first
 * (free tier covers most users out of the box, OpenAI-compatible API,
 * fast), Exa second (paid but stronger neural search — used as a
 * fallback when Tavily quota is exhausted or returns nothing useful),
 * SearxNG last (advanced opt-in for users who self-host their own
 * meta-search instance).
 */
export const SearchPreferencesSchema = z.object({
  order: z.array(z.string()).default(["tavily", "exa", "searxng"]),
  enabled: z.record(z.string(), z.boolean()).default({}),
});

export type SearchPreferences = z.infer<typeof SearchPreferencesSchema>;

const DEFAULT_PREFS: SearchPreferences = {
  order: ["tavily", "exa", "searxng"],
  enabled: {},
};

const VALID_NAMES = new Set<SearchProviderName>([
  "exa",
  "tavily",
  "searxng",
]);

function isValidName(s: string): s is SearchProviderName {
  return VALID_NAMES.has(s as SearchProviderName);
}

function isEnabled(prefs: SearchPreferences, name: SearchProviderName): boolean {
  // Treat missing entry as enabled — opt-out, not opt-in.
  return prefs.enabled[name] !== false;
}

/**
 * Load + parse `userAiConfig.preferences.search` for the user.
 * Falls back to the schema default on any failure (missing row,
 * malformed jsonb, DB unavailable). When `userId` is omitted (legacy
 * env-only path), returns the default unmodified.
 */
export async function loadSearchPreferences(
  userId: string | undefined,
): Promise<SearchPreferences> {
  if (!userId) return DEFAULT_PREFS;
  try {
    const db = coreDb();
    const [row] = await db
      .select({ preferences: userAiConfig.preferences })
      .from(userAiConfig)
      .where(eq(userAiConfig.userId, userId))
      .limit(1);
    const raw = row?.preferences as Record<string, unknown> | null | undefined;
    if (raw && typeof raw === "object" && "search" in raw) {
      const parsed = SearchPreferencesSchema.safeParse(raw.search);
      if (parsed.success) return parsed.data;
    }
    return DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}

/**
 * `SEARCH_PROVIDER_ORDER` env var fallback for the legacy (no-userId)
 * code path. Web app operators on Vercel still configure search via
 * env vars; this preserves that path with zero migration.
 */
function envOrder(): SearchProviderName[] {
  const raw = process.env.SEARCH_PROVIDER_ORDER;
  if (!raw) return ["exa", "tavily", "searxng"];
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(isValidName);
  return parts.length ? parts : ["exa", "tavily", "searxng"];
}

/**
 * The chain `webSearch` actually walks: ordered, enabled, available.
 *
 * - With `userId`: resolves the order from saved preferences, drops
 *   anything `enabled[name] === false`, then filters to providers
 *   whose required credential fields are populated (per-user creds
 *   first, env fallback).
 * - Without `userId`: env-driven order + env-driven availability —
 *   the legacy operator-managed path.
 */
export async function resolveSearchChain(
  userId: string | undefined,
): Promise<SearchProviderName[]> {
  const prefs = userId ? await loadSearchPreferences(userId) : DEFAULT_PREFS;
  const order = userId ? prefs.order.filter(isValidName) : envOrder();
  const enabled = order.filter((name) => isEnabled(prefs, name));
  const checks = await Promise.all(
    enabled.map(async (name) => ({
      name,
      ok: await isSearchProviderAvailable(userId, name),
    })),
  );
  return checks.filter((c) => c.ok).map((c) => c.name);
}

/**
 * Persist a partial update to the search-preferences slot. The tRPC
 * mutation in commit 3 wraps this. Only the keys present in `patch`
 * are written; the rest of `preferences` is preserved verbatim. The
 * userAiConfig row must already exist (created during onboarding).
 */
export async function setSearchPreferences(
  userId: string,
  patch: Partial<SearchPreferences>,
): Promise<SearchPreferences> {
  const db = coreDb();
  const [existing] = await db
    .select({ preferences: userAiConfig.preferences })
    .from(userAiConfig)
    .where(eq(userAiConfig.userId, userId))
    .limit(1);
  const existingPrefs =
    (existing?.preferences as Record<string, unknown> | null | undefined) ??
    {};
  const currentSearch = SearchPreferencesSchema.safeParse(
    existingPrefs.search ?? {},
  );
  const merged: SearchPreferences = {
    ...(currentSearch.success ? currentSearch.data : DEFAULT_PREFS),
    ...patch,
  };
  await db
    .update(userAiConfig)
    .set({
      preferences: { ...existingPrefs, search: merged },
      updatedAt: new Date(),
    })
    .where(eq(userAiConfig.userId, userId));
  return merged;
}
