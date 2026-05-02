import {
  assertVectorShape,
  batchedEmbed,
  type EmbedAdapter,
  type EmbedAdapterOpts,
} from "./types";

const BATCH_SIZE = 32; // Ollama's local server is the bottleneck, keep small

/**
 * Ollama embedding adapter. Uses the `/api/embed` endpoint which accepts
 * an `input` array and returns `embeddings`. No API key required since this
 * runs against a local or self-hosted Ollama instance.
 */
export const ollamaEmbedAdapter: EmbedAdapter = {
  async embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]> {
    if (!opts.baseUrl) throw new Error("Ollama embed adapter: missing baseUrl");
    const baseUrl = opts.baseUrl.replace(/\/$/, "");

    return batchedEmbed(texts, BATCH_SIZE, async (batch) => {
      const res = await fetch(`${baseUrl}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: opts.model,
          input: batch,
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Ollama embed API error ${res.status}: ${errText}`);
      }
      const data = (await res.json()) as { embeddings: number[][] };
      assertVectorShape(data.embeddings, batch.length, opts.dim, "Ollama");
      return data.embeddings;
    });
  },
};
