import {
  assertVectorShape,
  batchedEmbed,
  type EmbedAdapter,
  type EmbedAdapterOpts,
} from "./types";

const BATCH_SIZE = 96; // Cohere v2 allows up to 96 texts per request

/**
 * Cohere embedding adapter. Uses the v2 `/v2/embed` endpoint with
 * `input_type: search_document` for indexing and `search_query` for queries.
 *
 * Dimension is determined by the model; we validate but cannot reshape.
 */
export const cohereEmbedAdapter: EmbedAdapter = {
  async embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]> {
    if (!opts.apiKey) throw new Error("Cohere embed adapter: missing apiKey");
    const baseUrl = (opts.baseUrl ?? "https://api.cohere.com").replace(
      /\/$/,
      "",
    );

    return batchedEmbed(texts, BATCH_SIZE, async (batch) => {
      const res = await fetch(`${baseUrl}/v2/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify({
          texts: batch,
          model: opts.model,
          input_type: "search_document",
          embedding_types: ["float"],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Cohere embed API error ${res.status}: ${errText}`);
      }
      const data = (await res.json()) as {
        embeddings: { float: number[][] };
      };
      const vectors = data.embeddings.float;
      assertVectorShape(vectors, batch.length, opts.dim, "Cohere");
      return vectors;
    });
  },
};
