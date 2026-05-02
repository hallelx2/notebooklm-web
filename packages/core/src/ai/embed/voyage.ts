import {
  assertVectorShape,
  batchedEmbed,
  type EmbedAdapter,
  type EmbedAdapterOpts,
} from "./types";

const BATCH_SIZE = 128; // Voyage allows up to 128 texts per request

/**
 * Voyage AI embedding adapter. POST to /v1/embeddings with
 * `input_type: document` for indexed text or `query` for queries.
 */
export const voyageEmbedAdapter: EmbedAdapter = {
  async embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]> {
    if (!opts.apiKey) throw new Error("Voyage embed adapter: missing apiKey");
    const baseUrl = (opts.baseUrl ?? "https://api.voyageai.com/v1").replace(
      /\/$/,
      "",
    );

    return batchedEmbed(texts, BATCH_SIZE, async (batch) => {
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model: opts.model,
          input_type: "document",
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Voyage embed API error ${res.status}: ${errText}`);
      }
      const data = (await res.json()) as {
        data: { embedding: number[]; index: number }[];
      };
      const vectors = [...data.data]
        .sort((a, b) => a.index - b.index)
        .map((e) => e.embedding);
      assertVectorShape(vectors, batch.length, opts.dim, "Voyage");
      return vectors;
    });
  },
};
