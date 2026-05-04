export type SearchMode = "fast" | "deep";

export type WebResult = {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string;
  source?: string;
};

export type SearchProviderName = "exa" | "tavily" | "searxng";

/**
 * One configurable input the user provides for a search provider —
 * usually an API key, sometimes a base URL (SearxNG instance, custom
 * endpoint). The settings UI iterates `descriptor.fields` to render
 * the right form controls per provider; the runtime maps `key` to the
 * matching slot on `ResolvedSearchCredential`.
 */
export type SearchProviderField = {
  key: "apiKey" | "baseUrl";
  label: string;
  placeholder?: string;
  type?: "password" | "text" | "url";
  required?: boolean;
  /** Optional helper copy rendered under the field. */
  hint?: string;
};

/**
 * Static metadata describing a search provider — the bits the UI and
 * the credential resolver need before they have any runtime data. Every
 * provider exports its descriptor alongside its implementation.
 */
export type SearchProviderDescriptor = {
  id: SearchProviderName;
  label: string;
  description: string;
  homepage: string;
  /**
   * Env-var fallback names. When per-user creds aren't saved, the
   * resolver reads `process.env[envVars.apiKey]` etc. Keeps the legacy
   * single-tenant operator-managed config path working unchanged.
   */
  envVars: { apiKey?: string; baseUrl?: string };
  fields: SearchProviderField[];
};

/**
 * The shape `resolveSearchCredential` returns and the search provider's
 * `search()` consumes. Either field may be undefined; whether that
 * makes the provider usable depends on its `fields[].required` config.
 */
export type ResolvedSearchCredential = {
  apiKey?: string;
  baseUrl?: string;
};

export interface SearchProvider {
  name: SearchProviderName;
  descriptor: SearchProviderDescriptor;
  search(
    query: string,
    mode: SearchMode,
    limit: number,
    creds: ResolvedSearchCredential,
  ): Promise<WebResult[]>;
}
