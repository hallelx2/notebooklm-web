import { exaProvider } from "./exa";
import { searxngProvider } from "./searxng";
import { tavilyProvider } from "./tavily";
import type {
  SearchMode,
  SearchProvider,
  SearchProviderName,
  WebResult,
} from "./types";

export type { SearchMode, WebResult } from "./types";

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
 * Order is: paid providers first (where keys are configured), SearxNG as
 * the OSS fallback. `availableProviders()` filters out anything that
 * isn't actually configured — so a user with only `SEARXNG_URL` set
 * sees just SearxNG, a user with both Exa and SearxNG sees Exa first
 * (better quality on most queries) then SearxNG, etc.
 *
 * Override via `SEARCH_PROVIDER_ORDER` env var, e.g.
 *   SEARCH_PROVIDER_ORDER=searxng,exa,tavily
 * to bias toward the OSS option.
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

export function availableProviders(): SearchProviderName[] {
  return resolveOrder().filter((n) => PROVIDERS[n].available());
}

export async function webSearch(
  query: string,
  mode: SearchMode = "fast",
  limit = 8,
): Promise<WebResult[]> {
  const order = resolveOrder().filter((n) => PROVIDERS[n].available());
  if (order.length === 0) {
    throw new Error(
      "No web search provider configured (set EXA_API_KEY, TAVILY_API_KEY, and/or SEARXNG_URL).",
    );
  }

  const errors: string[] = [];
  for (const name of order) {
    try {
      const results = await PROVIDERS[name].search(query, mode, limit);
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
