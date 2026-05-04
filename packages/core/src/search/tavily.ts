import type {
  SearchProvider,
  SearchProviderDescriptor,
  WebResult,
} from "./types";

const descriptor: SearchProviderDescriptor = {
  id: "tavily",
  label: "Tavily",
  description:
    "AI-tuned web search optimised for retrieval-augmented generation. Paid; free tier available at tavily.com.",
  homepage: "https://tavily.com",
  envVars: { apiKey: "TAVILY_API_KEY" },
  fields: [
    {
      key: "apiKey",
      label: "API key",
      type: "password",
      placeholder: "tvly-…",
      required: true,
      hint: "Find or create at https://app.tavily.com/home",
    },
  ],
};

export const tavilyProvider: SearchProvider = {
  name: "tavily",
  descriptor,
  async search(query, mode, limit, creds) {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      throw new Error("Tavily: missing apiKey");
    }
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
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
