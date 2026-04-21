export type SearchMode = "fast" | "deep";

export type WebResult = {
  url: string;
  title: string;
  snippet: string;
  publishedAt?: string;
  source?: string;
};

export type SearchProviderName = "exa" | "tavily";

export interface SearchProvider {
  name: SearchProviderName;
  available(): boolean;
  search(query: string, mode: SearchMode, limit: number): Promise<WebResult[]>;
}
