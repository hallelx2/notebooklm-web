import type { SearchProvider, WebResult } from "./types";

export const tavilyProvider: SearchProvider = {
  name: "tavily",
  available() {
    return !!process.env.TAVILY_API_KEY;
  },
  async search(query, mode, limit) {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: limit,
        search_depth: mode === "deep" ? "advanced" : "basic",
      }),
    });
    if (!res.ok) {
      throw new Error(
        `Tavily ${res.status}: ${await res.text().catch(() => "")}`,
      );
    }
    const data = (await res.json()) as {
      results: {
        url: string;
        title: string;
        content: string;
        published_date?: string;
      }[];
    };
    return data.results.map<WebResult>((r) => ({
      url: r.url,
      title: r.title,
      snippet: r.content.slice(0, 400),
      publishedAt: r.published_date,
      source: "tavily",
    }));
  },
};
