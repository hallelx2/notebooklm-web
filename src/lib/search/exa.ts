import type { SearchProvider, WebResult } from "./types";

export const exaProvider: SearchProvider = {
  name: "exa",
  available() {
    return !!process.env.EXA_API_KEY;
  },
  async search(query, mode, limit) {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.EXA_API_KEY ?? "",
      },
      body: JSON.stringify({
        query,
        numResults: limit,
        type: mode === "deep" ? "neural" : "keyword",
        useAutoprompt: mode === "deep",
      }),
    });
    if (!res.ok) {
      throw new Error(`Exa ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const data = (await res.json()) as {
      results: {
        url: string;
        title: string;
        text?: string;
        highlights?: string[];
        publishedDate?: string;
      }[];
    };
    return data.results.map<WebResult>((r) => ({
      url: r.url,
      title: r.title,
      snippet: (r.highlights?.[0] ?? r.text ?? "").slice(0, 400),
      publishedAt: r.publishedDate,
      source: "exa",
    }));
  },
};
