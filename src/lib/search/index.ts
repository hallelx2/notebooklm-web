import "server-only";
import { exaProvider } from "./exa";
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
};

function resolveOrder(): SearchProviderName[] {
  const raw = process.env.SEARCH_PROVIDER_ORDER;
  if (!raw) return ["exa", "tavily"];
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is SearchProviderName => p === "exa" || p === "tavily");
  return parts.length ? parts : ["exa", "tavily"];
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
      "No web search provider configured (set EXA_API_KEY and/or TAVILY_API_KEY).",
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
