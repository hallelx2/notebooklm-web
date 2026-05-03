import type { SearchProvider, WebResult } from "./types";

/**
 * SearxNG — open-source, self-hostable meta-search engine that aggregates
 * Google, Bing, DuckDuckGo, Wikipedia and dozens of other sources behind a
 * single JSON API. Slots in alongside the paid providers (Exa, Tavily) so
 * users without API keys can still run deep-research.
 *
 * Configuration:
 *   - SEARXNG_URL — base URL of a SearxNG instance (no trailing slash).
 *     Examples: `http://localhost:8080`, `https://searx.your-host.com`.
 *     Required — `available()` returns false without it. We deliberately
 *     don't ship a public-instance default; public instances rate-limit
 *     unpredictably and we'd be putting their hostname in our request
 *     path without the operator's blessing. Self-host for production
 *     workloads (single docker compose: https://docs.searxng.org/admin/installation.html).
 *
 * Mode behaviour:
 *   - fast: lets the instance use its default engine list — faster, fewer
 *     network calls.
 *   - deep: forces a multi-engine query (google, bing, duckduckgo,
 *     wikipedia) so we get cross-source coverage even on instances tuned
 *     for speed.
 */
export const searxngProvider: SearchProvider = {
  name: "searxng",
  available() {
    return !!process.env.SEARXNG_URL;
  },
  async search(query, mode, limit) {
    const base = (process.env.SEARXNG_URL ?? "").replace(/\/+$/, "");
    if (!base) {
      throw new Error("SEARXNG_URL is not configured");
    }

    // POST + form-encoded body matches `searx-cli` and is the most
    // compatible across instance versions. `format=json` is required —
    // without it, SearxNG returns HTML and the JSON.parse below fails.
    const params = new URLSearchParams();
    params.set("q", query);
    params.set("format", "json");
    params.set("categories", "general");
    if (mode === "deep") {
      params.set("engines", "google,bing,duckduckgo,wikipedia");
    }

    const res = await fetch(`${base}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      throw new Error(
        `SearxNG ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }

    const data = (await res.json()) as {
      results?: {
        url: string;
        title: string;
        content?: string;
        publishedDate?: string;
        engine?: string;
      }[];
    };

    const results = data.results ?? [];
    return results.slice(0, limit).map<WebResult>((r) => ({
      url: r.url,
      title: r.title,
      snippet: (r.content ?? "").slice(0, 400),
      publishedAt: r.publishedDate,
      source: "searxng",
    }));
  },
};
