import type {
  SearchProvider,
  SearchProviderDescriptor,
  WebResult,
} from "./types";

const descriptor: SearchProviderDescriptor = {
  id: "searxng",
  label: "SearxNG",
  description:
    "Open-source, self-hostable meta-search aggregating Google / Bing / DuckDuckGo / Wikipedia. No API key — point at your own instance.",
  homepage: "https://docs.searxng.org",
  envVars: { baseUrl: "SEARXNG_URL" },
  fields: [
    {
      key: "baseUrl",
      label: "Instance URL",
      type: "url",
      placeholder: "http://localhost:8888",
      required: true,
      hint: "Self-host with `docker compose up -d` from docker/searxng/, or point at any instance you trust.",
    },
  ],
};

export const searxngProvider: SearchProvider = {
  name: "searxng",
  descriptor,
  async search(query, mode, limit, creds) {
    const base = (creds.baseUrl ?? "").replace(/\/+$/, "");
    if (!base) {
      throw new Error("SearxNG: missing baseUrl");
    }

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
