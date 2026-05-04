import {
  isSearchProviderAvailable,
  resolveSearchCredential,
  searchProviderDescriptors,
} from "./credentials";
import { exaProvider } from "./exa";
import {
  loadSearchPreferences,
  resolveSearchChain,
  SearchPreferencesSchema,
  setSearchPreferences,
} from "./preferences";
import { searxngProvider } from "./searxng";
import { tavilyProvider } from "./tavily";
import type {
  SearchMode,
  SearchProvider,
  SearchProviderDescriptor,
  SearchProviderName,
  WebResult,
} from "./types";

export type {
  ResolvedSearchCredential,
  SearchMode,
  SearchProviderDescriptor,
  SearchProviderField,
  SearchProviderName,
  WebResult,
} from "./types";

export {
  isSearchProviderAvailable,
  resolveSearchCredential,
  searchProviderDescriptors,
} from "./credentials";

export {
  loadSearchPreferences,
  resolveSearchChain,
  type SearchPreferences,
  SearchPreferencesSchema,
  setSearchPreferences,
} from "./preferences";

const PROVIDERS: Record<SearchProviderName, SearchProvider> = {
  exa: exaProvider,
  tavily: tavilyProvider,
  searxng: searxngProvider,
};

/**
 * Static descriptor list — used by the settings UI to render one row
 * per provider with its configured fields.
 */
export function listSearchProviderDescriptors(): SearchProviderDescriptor[] {
  return Object.values(searchProviderDescriptors);
}

/**
 * Run a single web search through the user's configured provider
 * chain. Returns the first non-empty, non-error result; throws with
 * an aggregated reason when every provider in the chain fails.
 *
 * Chain resolution lives in `preferences.ts -> resolveSearchChain`:
 *   - With `ctx.userId`: per-user `userAiConfig.preferences.search`
 *     decides order + enabled flags; per-user creds in
 *     `userProviderCredentials` (encrypted) win over env vars.
 *   - Without `ctx.userId`: legacy `SEARCH_PROVIDER_ORDER` env order +
 *     env-var creds — what the web app's operator-managed Vercel env
 *     has always done. Zero behaviour change for that path.
 */
export async function webSearch(
  query: string,
  mode: SearchMode = "fast",
  limit = 8,
  ctx?: { userId?: string },
): Promise<WebResult[]> {
  const order = await resolveSearchChain(ctx?.userId);
  if (order.length === 0) {
    throw new Error(
      "No web search provider configured. Add a key in Settings → Web Search, or set EXA_API_KEY / TAVILY_API_KEY / SEARXNG_URL in the environment.",
    );
  }

  const errors: string[] = [];
  for (const name of order) {
    try {
      const creds = await resolveSearchCredential(ctx?.userId, name);
      const results = await PROVIDERS[name].search(query, mode, limit, creds);
      if (results.length === 0) {
        errors.push(`${name}: no results`);
        continue;
      }
      return results;
    } catch (err) {
      errors.push(
        `${name}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  throw new Error(`All search providers failed — ${errors.join(" | ")}`);
}

/**
 * Back-compat shim. Older code (and any imports that didn't update
 * yet) called `availableProviders()` synchronously off env. The new
 * resolver is async + per-user; this wrapper returns the user-aware
 * chain for callers that still expect a list of provider names.
 *
 * @deprecated Use `resolveSearchChain(userId)` directly.
 */
export async function availableProviders(ctx?: {
  userId?: string;
}): Promise<SearchProviderName[]> {
  return resolveSearchChain(ctx?.userId);
}

/**
 * Run a one-off search through a specific provider with explicit
 * credentials, bypassing the user's preference chain. Used by the
 * Settings → Web Search "Test connection" button: the user clicks
 * Test, the UI sends the proposed creds (which may not be saved
 * yet), the server runs a `limit=1` query and returns either a
 * sample result + latency, or the error string.
 *
 * Never throws — wraps everything in `{ ok: false, error }` so the
 * UI can render a friendly message without try/catch.
 */
export type TestSearchProviderResult =
  | {
      ok: true;
      latencyMs: number;
      sample: { url: string; title: string };
    }
  | { ok: false; error: string };

export async function testSearchProvider(
  providerId: SearchProviderName,
  creds: { apiKey?: string; baseUrl?: string },
): Promise<TestSearchProviderResult> {
  const start = Date.now();
  try {
    const results = await PROVIDERS[providerId].search(
      "openai gpt",
      "fast",
      1,
      creds,
    );
    if (results.length === 0) {
      return { ok: false, error: "Provider returned no results" };
    }
    const r = results[0];
    return {
      ok: true,
      latencyMs: Date.now() - start,
      sample: { url: r.url, title: r.title },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
