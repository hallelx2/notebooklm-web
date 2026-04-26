import type { ProviderId } from "@/lib/ai/providers";
import { cohereEmbedAdapter } from "./cohere";
import { googleEmbedAdapter } from "./google";
import { mistralEmbedAdapter } from "./mistral";
import { ollamaEmbedAdapter } from "./ollama";
import { openaiEmbedAdapter } from "./openai";
import { openaiCompatibleEmbedAdapter } from "./openai_compatible";
import { togetherEmbedAdapter } from "./together";
import type { EmbedAdapter } from "./types";
import { voyageEmbedAdapter } from "./voyage";

/**
 * Look up the embedding adapter for a given provider. Returns `null` for
 * providers that do not support embeddings (Anthropic, Groq, OpenRouter,
 * xAI), letting callers fail fast with a clear error.
 */
export function getEmbedAdapter(provider: ProviderId): EmbedAdapter | null {
  switch (provider) {
    case "google":
      return googleEmbedAdapter;
    case "openai":
      return openaiEmbedAdapter;
    case "cohere":
      return cohereEmbedAdapter;
    case "voyage":
      return voyageEmbedAdapter;
    case "mistral":
      return mistralEmbedAdapter;
    case "ollama":
      return ollamaEmbedAdapter;
    case "together":
      return togetherEmbedAdapter;
    case "openai_compatible":
      return openaiCompatibleEmbedAdapter;
    case "anthropic":
    case "groq":
    case "openrouter":
    case "xai":
      return null;
  }
}

export type { EmbedAdapter, EmbedAdapterOpts } from "./types";
