import {
  assertVectorShape,
  batchedEmbed,
  type EmbedAdapter,
  type EmbedAdapterOpts,
} from "./types";

const BATCH_SIZE = 90; // Google allows max 100 per batch request

/**
 * Google Generative AI embedding adapter.
 *
 * Uses the `batchEmbedContents` REST endpoint directly because the AI SDK
 * does not pass `outputDimensionality`, which we need to truncate
 * `gemini-embedding-001` from its native 3072 dims to a supported size.
 */
export const googleEmbedAdapter: EmbedAdapter = {
  async embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]> {
    if (!opts.apiKey) throw new Error("Google embed adapter: missing apiKey");

    return batchedEmbed(texts, BATCH_SIZE, async (batch) => {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:batchEmbedContents?key=${opts.apiKey}`;
      const body = {
        requests: batch.map((text) => ({
          model: `models/${opts.model}`,
          content: { parts: [{ text }] },
          outputDimensionality: opts.dim,
        })),
      };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Google embed API error ${res.status}: ${errText}`);
      }
      const data = (await res.json()) as {
        embeddings: { values: number[] }[];
      };
      const vectors = data.embeddings.map((e) => e.values);
      assertVectorShape(vectors, batch.length, opts.dim, "Google");
      return vectors;
    });
  },
};
