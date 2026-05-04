import {
  isSearchProviderAvailable,
  resolveSearchCredential,
  searchProviderDescriptors,
} from "./credentials";
import { exaProvider } from "./exa";
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

const PROVIDERS: Record<SearchProviderName, SearchProvider> = {
  exa: exaProvider,
  tavily: tavilyProvider,
  searxng: searxngProvider,
};

const VALID_NAMES = new Set<SearchProviderName>(["exa", "tavily", "searxng"]);

function isValidName(s: string): s is SearchProviderName {
  return VALID_NAMES.has(s as SearchProviderName);
}

/**
 * Static descriptor list — used by the settings UI to render one row
 * per provider with its configured fields.
 */
export function listSearchProviderDescriptors(): SearchProviderDescriptor[] {
  return Object.values(searchProviderDescriptors);
}

/**
 * Default fallback order when the user hasn't set
 * `userAiConfig.preferences.search.order`. Paid providers first
 * (better quality on most queries) with the OSS fallback last;
 * `availableProviders()` filters out anything not configured.
 *
 * Override via `SEARCH_PROVIDER_ORDER` env var, e.g.
 *   SEARCH_PROVIDER_ORDER=searxng,exa,tavily
 */
function resolveOrder(): SearchProviderName[] {
  const raw = process.env.SEARCH_PROVIDER_ORDER;
  if (!raw) return ["exa", "tavily", "searxng"];
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(isValidName);
  return parts.length ? parts : ["exa", "tavily", "searxng"];
}

/**
 * Resolved fallback chain — providers whose required credential fields
 * are populated for this user. The expensive part is the DB lookup
 * inside `isSearchProviderAvailable`; we run them in parallel.
 *
 * `ctx.userId` is optional: when omitted, only env-var creds are
 * considered (legacy operator-managed config).
 */
export async function availableProviders(ctx?: {
  userId?: string;
}): Promise<SearchProviderName[]> {
  const order = resolveOrder();
  const checks = await Promise.all(
    order.map(async (name) => ({
      name,
      ok: await isSearchProviderAvailable(ctx?.userId, name),
    })),
  );
  return checks.filter((c) => c.ok).map((c) => c.name);
}

/**
 * Run a web search through the user's configured provider chain.
 * Returns the first non-empty, non-error result; throws when all
 * providers fail.
 *
 * `ctx.userId` should be passed by callers that have a session in
 * scope (handlers, agent runtimes) so per-user credentials win over
 * env-var fallback. Calls without `ctx` (e.g. CLI smoke tests) keep
 * working in env-only mode.
 */
export async function webSearch(
  query: string,
  mode: SearchMode = "fast",
  limit = 8,
  ctx?: { userId?: string },
): Promise<WebResult[]> {
  const order = await availableProviders(ctx);
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
