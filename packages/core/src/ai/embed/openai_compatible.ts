import { makeOpenAIEmbedAdapter } from "./openai";
import type { EmbedAdapter, EmbedAdapterOpts } from "./types";

/**
 * Generic OpenAI-compatible embedding adapter. The `baseUrl` is required at
 * call time -- there's no sensible default. Use this for self-hosted
 * inference servers (LM Studio, vLLM, llama.cpp's `--embeddings`) or any
 * gateway that speaks the OpenAI wire format.
 */
export const openaiCompatibleEmbedAdapter: EmbedAdapter = {
  async embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]> {
    if (!opts.baseUrl)
      throw new Error("OpenAI-compatible embed adapter: missing baseUrl");
    // Delegate to the OpenAI adapter shape with the user's base URL.
    return makeOpenAIEmbedAdapter(opts.baseUrl, "OpenAI-compatible").embed(
      texts,
      opts,
    );
  },
};
