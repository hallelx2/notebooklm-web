/**
 * Built-in local embedding adapter.
 *
 * Runs sentence-transformers ONNX models inside the host process via
 * @huggingface/transformers. No GPU, no API key, no Docker, no Ollama
 * install — the truly plug-and-play option for the desktop app.
 *
 * Resolution priority for model files:
 *   1. NOTEBOOKLM_BUNDLED_MODELS_DIR/embed/<org>/<repo>/  (packaged
 *      installer ships the ONNX next to the executable; transformers.js
 *      reads from disk and never touches HF Hub)
 *   2. NOTEBOOKLM_MODEL_CACHE_DIR (desktop adapter points this at
 *      <NOTEBOOKLM_DATA_DIR>/models)
 *   3. transformers.js default (~/.cache/huggingface/hub or
 *      <cwd>/node_modules/.cache/...)
 *
 * Defaults:
 *   - dtype: "q8" — 8-bit quantized weights. ~4× smaller, ~2× faster on
 *     CPU than fp32, with ≤1 MTEB-point quality loss.
 *   - pooling: "mean" + normalize: true — the standard sentence-transformer
 *     output shape for cosine retrieval.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
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

    // 1. Prefer bundled model files when present — that's the packaged-
    //    installer path. transformers.js reads from disk, never tries
    //    HF Hub, never tries to write a cache.
    const bundledRoot = process.env.NOTEBOOKLM_BUNDLED_MODELS_DIR;
    const bundledModelDir = bundledRoot
      ? join(bundledRoot, "embed", ...modelId.split("/"))
      : null;
    if (bundledModelDir && existsSync(bundledModelDir)) {
      env.allowLocalModels = true;
      env.localModelPath = join(bundledRoot as string, "embed");
      env.allowRemoteModels = false;
    } else {
      // 2. Otherwise use the desktop adapter's data dir (or whatever
      //    NOTEBOOKLM_MODEL_CACHE_DIR points at) and let HF Hub fill it
      //    in on first use.
      const desiredCacheDir = process.env.NOTEBOOKLM_MODEL_CACHE_DIR;
      if (desiredCacheDir && env.cacheDir !== desiredCacheDir) {
        env.cacheDir = desiredCacheDir;
      }
      env.allowRemoteModels = true;
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

/**
 * Optional RPC hook the desktop main process publishes via
 * `globalThis.__notebooklmEmbedRpc`. When present, every batch ships
 * to a utility-process worker instead of running ONNX inference inside
 * the api-server's event loop. Mirrors the kokoro-local TTS hook.
 */
type EmbedRpc = (
  type: "embed",
  payload: { modelId: string; texts: string[] },
) => Promise<{ vectors: number[][] }>;

function getEmbedRpc(): EmbedRpc | null {
  // biome-ignore lint/suspicious/noExplicitAny: globalThis bridge from desktop main
  const fn = (globalThis as any).__notebooklmEmbedRpc;
  return typeof fn === "function" ? (fn as EmbedRpc) : null;
}

export const localEmbedAdapter: EmbedAdapter = {
  async embed(texts: string[], opts: EmbedAdapterOpts): Promise<number[][]> {
    const rpc = getEmbedRpc();
    if (rpc) {
      // Worker path: each batch is one rpc round-trip. The worker
      // holds the warm pipeline keyed by modelId, so consecutive
      // batches don't re-pay the model-load cost. Marshalling cost
      // for a batch of 32×384 floats is ~100KB over structured
      // clone — negligible compared to the inference itself.
      return batchedEmbed(texts, BATCH_SIZE, async (batch) => {
        const result = await rpc("embed", {
          modelId: opts.model,
          texts: batch,
        });
        assertVectorShape(result.vectors, batch.length, opts.dim, "Local");
        return result.vectors;
      });
    }

    // In-process path: dev mode under `bun run dev`, tests, server
    // deployments without a worker host.
    const pipe = await getPipeline(opts.model);
    return batchedEmbed(texts, BATCH_SIZE, async (batch) => {
      const tensor = await pipe(batch, { pooling: "mean", normalize: true });
      const vectors = tensor.tolist();
      assertVectorShape(vectors, batch.length, opts.dim, "Local");
      return vectors;
    });
  },
};
