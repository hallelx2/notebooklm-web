import { makeOpenAIEmbedAdapter } from "./openai";

/**
 * Together AI exposes an OpenAI-compatible embeddings endpoint. Models like
 * `togethercomputer/m2-bert-80M-32k-retrieval` do not accept `dimensions`,
 * which is fine -- our shared OpenAI adapter only sends that parameter for
 * `text-embedding-3-*` models.
 */
export const togetherEmbedAdapter = makeOpenAIEmbedAdapter(
  "https://api.together.xyz/v1",
  "Together",
);
