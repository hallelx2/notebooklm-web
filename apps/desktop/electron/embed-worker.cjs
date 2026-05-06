// Electron utilityProcess worker — runs the local sentence-transformer
// pipeline (bge-small / bge-base / bge-large via @huggingface/transformers)
// in its own OS process so the api-server's event loop stays free for
// renderer fetches and Windows IPC during ingestion.
//
// Same shape as `tts-worker.cjs`: structured-clone RPC over
// `process.parentPort`, one warm pipeline per modelId held in a Map,
// load failures evict the cached promise so the next request retries.
//
// Why a separate process and not `worker_threads`: onnxruntime-node's
// native bindings carry per-process state (thread pool, intra-op
// scheduler). Two ONNX runtimes inside the same process — even in
// different V8 isolates — can quietly interfere; a separate process
// is the obvious boundary. Crashes here only kill embedding; the
// renderer, main, api-server and TTS worker are untouched.

const { existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

// One pending Promise per modelId. Concurrent first-time requests
// coalesce on the same promise instead of spawning N model loads.
const pipelines = new Map();

async function loadPipeline(modelId) {
  const existing = pipelines.get(modelId);
  if (existing) return existing;

  const promise = (async () => {
    // Pull the *transformers.js* env directly. (kokoro-js's `env`
    // re-export was the bug behind the in-process path silently
    // failing on packaged builds — see kokoro-local.ts for the long
    // version.) Embeddings don't go through kokoro-js at all, but
    // sticking with this pattern keeps both workers identical.
    const tjs = await import("@huggingface/transformers");
    const { pipeline, env } = tjs;

    const bundledRoot = process.env.NOTEBOOKLM_BUNDLED_MODELS_DIR;
    const bundledModelDir = bundledRoot
      ? join(bundledRoot, "embed", ...modelId.split("/"))
      : null;
    if (bundledModelDir && existsSync(bundledModelDir)) {
      env.allowLocalModels = true;
      env.localModelPath = join(bundledRoot, "embed");
      env.allowRemoteModels = false;
      // biome-ignore lint/suspicious/noConsole: surfaces in desktop.log
      console.log(
        `[embed-worker] bundled mode: localModelPath=${env.localModelPath} modelId=${modelId}`,
      );
    } else {
      // No bundled weights for this id — fall back to the desktop
      // adapter's data dir (or whatever NOTEBOOKLM_MODEL_CACHE_DIR
      // points at) and let HF Hub fill it in on first use.
      const desiredCacheDir = process.env.NOTEBOOKLM_MODEL_CACHE_DIR;
      if (desiredCacheDir) {
        try {
          if (!existsSync(desiredCacheDir))
            mkdirSync(desiredCacheDir, { recursive: true });
        } catch {
          // load below will surface a clearer error if writes fail
        }
        env.cacheDir = desiredCacheDir;
      }
      env.allowRemoteModels = true;
      console.log(
        `[embed-worker] cache mode: cacheDir=${env.cacheDir} modelId=${modelId}`,
      );
    }

    const t0 = Date.now();
    const pipe = await pipeline("feature-extraction", modelId, {
      dtype: "q8",
    });
    console.log(
      `[embed-worker] pipeline ready for ${modelId} in ${Date.now() - t0}ms`,
    );
    return pipe;
  })();

  pipelines.set(modelId, promise);
  promise.catch(() => pipelines.delete(modelId));
  return promise;
}

async function handleEmbed(payload) {
  const pipe = await loadPipeline(payload.modelId);
  const tensor = await pipe(payload.texts, {
    pooling: "mean",
    normalize: true,
  });
  // tolist() returns nested number[][]. Marshalling it via structured
  // clone is fine for normal batch sizes (32 texts × 384 dims ≈ 100KB).
  return { vectors: tensor.tolist() };
}

if (!process.parentPort) {
  console.error(
    "[embed-worker] process.parentPort is undefined — this script must be launched via Electron utilityProcess.fork(), not bare Node.",
  );
  process.exit(1);
}

process.parentPort.on("message", async (event) => {
  const msg = event.data;
  if (!msg || typeof msg.id !== "number" || typeof msg.type !== "string") {
    console.warn("[embed-worker] received malformed message:", msg);
    return;
  }
  const { id, type, payload } = msg;
  try {
    let result;
    if (type === "embed") {
      result = await handleEmbed(payload);
    } else if (type === "ping") {
      result = { pong: true };
    } else {
      throw new Error(`unknown rpc type: ${type}`);
    }
    process.parentPort.postMessage({ id, ok: true, result });
  } catch (err) {
    process.parentPort.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.stack || err.message : String(err),
    });
  }
});

process.on("uncaughtException", (err) => {
  console.error("[embed-worker] uncaughtException:", err.stack || err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error(
    "[embed-worker] unhandledRejection:",
    reason instanceof Error ? reason.stack || reason.message : reason,
  );
});

console.log(
  `[embed-worker] started, pid=${process.pid}, node=${process.version}`,
);
