import type {
  SearchProvider,
  SearchProviderDescriptor,
  WebResult,
} from "./types";

const descriptor: SearchProviderDescriptor = {
  id: "exa",
  label: "Exa",
  description:
    "Neural + keyword web search with full-text retrieval. Paid; sign up at exa.ai.",
  homepage: "https://exa.ai",
  envVars: { apiKey: "EXA_API_KEY" },
  fields: [
    {
      key: "apiKey",
      label: "API key",
      type: "password",
      placeholder: "exa_…",
      required: true,
      hint: "Find or create at https://dashboard.exa.ai/api-keys",
    },
  ],
};

export const exaProvider: SearchProvider = {
  name: "exa",
  descriptor,
  async search(query, mode, limit, creds) {
    const apiKey = creds.apiKey;
    if (!apiKey) {
      throw new Error("Exa: missing apiKey");
    }
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
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
