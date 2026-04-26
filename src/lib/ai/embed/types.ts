/**
 * Shared types for embedding adapters.
 *
 * Each provider has a thin adapter under `src/lib/ai/embed/<provider>.ts`
 * exporting an {@link EmbedAdapter} that turns texts into vectors.
 */

export interface EmbedAdapterOpts {
  apiKey?: string;
  baseUrl?: string;
  model: string;
  /**
   * Expected output dimension. Adapters that support runtime dimension
   * selection (Google's `outputDimensionality`, OpenAI's `dimensions`)
   * pass this through. Adapters that don't (most others) use it only for
   * validation.
   */
  dim: number;
}

export interface EmbedAdapter {
  /**
   * Embed a batch of texts. Implementations must respect their provider's
   * batch-size limit by chunking internally if needed.
   */
  embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]>;
}

/** Helper used by every adapter to validate the response shape. */
export function assertVectorShape(
  vectors: number[][],
  expectedCount: number,
  expectedDim: number,
  providerLabel: string,
) {
  if (vectors.length !== expectedCount) {
    throw new Error(
      `${providerLabel}: expected ${expectedCount} vectors, got ${vectors.length}`,
    );
  }
  for (let i = 0; i < vectors.length; i++) {
    const v = vectors[i];
    if (!Array.isArray(v) || v.length !== expectedDim) {
      throw new Error(
        `${providerLabel}: vector ${i} has length ${v?.length ?? "?"}, expected ${expectedDim}`,
      );
    }
  }
}

/** Helper for adapters that need to chunk into smaller batch requests. */
export async function batchedEmbed(
  texts: string[],
  batchSize: number,
  fn: (batch: string[]) => Promise<number[][]>,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const vecs = await fn(batch);
    out.push(...vecs);
  }
  return out;
}
