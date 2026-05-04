/**
 * Built-in local embedding adapter.
 *
 * Runs sentence-transformers ONNX models inside the host process via
 * @huggingface/transformers. No GPU, no API key, no Docker, no Ollama
 * install — the truly plug-and-play option for the desktop app.
 *
 * Models download once to <env.cacheDir>/<modelId>/ on first use and are
 * cached forever. After that everything is offline.
 *
 * Defaults:
 *   - dtype: "q8" — 8-bit quantized weights. ~4× smaller, ~2× faster on
 *     CPU than fp32, with ≤1 MTEB-point quality loss.
 *   - pooling: "mean" + normalize: true — the standard sentence-transformer
 *     output shape for cosine retrieval.
 *
 * The cache directory comes from `NOTEBOOKLM_MODEL_CACHE_DIR` or, failing
 * that, transformers.js's default (`<cwd>/node_modules/.cache/...`). The
 * desktop app sets `NOTEBOOKLM_MODEL_CACHE_DIR=<NOTEBOOKLM_DATA_DIR>/models`
 * so models live alongside PGlite + storage in `~/.notebooklm/`.
 */

import {
  assertVectorShape,
  batchedEmbed,
  type EmbedAdapter,
  type EmbedAdapterOpts,
} from "./types";

// Keep the loaded pipeline alive across calls. Loading a model takes
// seconds + hundreds of MB of RAM, so we want exactly one in memory per
// (modelId, dtype) and we want it to stay warm for the life of the process.
type PipelineFn = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): number[][] }>;

const pipelineCache = new Map<string, Promise<PipelineFn>>();

/**
 * Lazy-load (and cache) the transformers.js pipeline for a given model.
 * The first call kicks off model download + warmup; subsequent calls
 * resolve instantly with the same loaded pipeline.
 */
async function getPipeline(modelId: string): Promise<PipelineFn> {
  const key = modelId;
  let pending = pipelineCache.get(key);
  if (pending) return pending;

  pending = (async () => {
    // Dynamic import so we don't pay the bundle / startup cost on
    // deployments that never use the local provider (web app, etc.).
    const transformers = await import("@huggingface/transformers");
    const { pipeline, env } = transformers;

    // Wire the cache directory up once, the first time we load anything.
    // env is a singleton in the transformers module — setting it here
    // governs every subsequent pipeline() call.
    const desiredCacheDir = process.env.NOTEBOOKLM_MODEL_CACHE_DIR;
    if (desiredCacheDir && env.cacheDir !== desiredCacheDir) {
      env.cacheDir = desiredCacheDir;
    }

    const pipe = await pipeline("feature-extraction", modelId, {
      dtype: "q8",
    });
    return pipe as unknown as PipelineFn;
  })();

  pipelineCache.set(key, pending);
  // If the load fails, drop the cached promise so the next call retries.
  pending.catch(() => pipelineCache.delete(key));
  return pending;
}

const BATCH_SIZE = 32; // CPU inference -- keep batches modest to stay responsive

export const localEmbedAdapter: EmbedAdapter = {
  async embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]> {
    const pipe = await getPipeline(opts.model);

    return batchedEmbed(texts, BATCH_SIZE, async (batch) => {
      const tensor = await pipe(batch, { pooling: "mean", normalize: true });
      const vectors = tensor.tolist();
      assertVectorShape(vectors, batch.length, opts.dim, "Local");
      return vectors;
    });
  },
};
