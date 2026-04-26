import { makeOpenAIEmbedAdapter } from "./openai";

/**
 * Mistral's embedding API speaks OpenAI's wire format with a different base
 * URL. `mistral-embed` always returns 1024-dim vectors and does not accept
 * a `dimensions` parameter -- the shared OpenAI adapter only sends
 * `dimensions` for `text-embedding-3-*`, so this is safe to reuse.
 */
export const mistralEmbedAdapter = makeOpenAIEmbedAdapter(
  "https://api.mistral.ai/v1",
  "Mistral",
);
