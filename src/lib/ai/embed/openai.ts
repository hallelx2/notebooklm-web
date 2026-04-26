import {
  assertVectorShape,
  batchedEmbed,
  type EmbedAdapter,
  type EmbedAdapterOpts,
} from "./types";

const BATCH_SIZE = 100;

/**
 * OpenAI embedding adapter. Also used as the base for OpenAI-compatible
 * endpoints (Together, OpenRouter via custom base_url, etc.) since they
 * speak the same wire format.
 *
 * `text-embedding-3-*` models support a `dimensions` parameter to truncate
 * the output, which is how we adapt 3072-native models to our 1536/768
 * tables. `text-embedding-ada-002` does not -- we just trust the model's
 * native size.
 */
export function makeOpenAIEmbedAdapter(
  defaultBaseUrl: string,
  providerLabel: string,
): EmbedAdapter {
  return {
    async embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]> {
      if (!opts.apiKey)
        throw new Error(`${providerLabel} embed adapter: missing apiKey`);
      const baseUrl = (opts.baseUrl ?? defaultBaseUrl).replace(/\/$/, "");

      return batchedEmbed(texts, BATCH_SIZE, async (batch) => {
        const body: Record<string, unknown> = {
          input: batch,
          model: opts.model,
        };
        // Only newer text-embedding-3 models accept `dimensions`. Older
        // models (ada-002) error on it. We pass it for "3-*" prefix only.
        if (/text-embedding-3/.test(opts.model)) {
          body.dimensions = opts.dim;
        }

        const res = await fetch(`${baseUrl}/embeddings`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${opts.apiKey}`,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(
            `${providerLabel} embed API error ${res.status}: ${errText}`,
          );
        }
        const data = (await res.json()) as {
          data: { embedding: number[]; index: number }[];
        };
        // OpenAI returns results in order; sort by index defensively.
        const vectors = [...data.data]
          .sort((a, b) => a.index - b.index)
          .map((e) => e.embedding);
        assertVectorShape(vectors, batch.length, opts.dim, providerLabel);
        return vectors;
      });
    },
  };
}

export const openaiEmbedAdapter = makeOpenAIEmbedAdapter(
  "https://api.openai.com/v1",
  "OpenAI",
);
