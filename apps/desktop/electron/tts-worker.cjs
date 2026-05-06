// Electron utilityProcess worker — runs Kokoro TTS in its own OS
// process so the main process and embedded api-server stay free to
// pump Windows IPC and answer renderer fetches while ONNX inference
// is running.
//
// Why a separate process and not just `worker_threads`:
//   - onnxruntime-node loads native .node binaries that initialize
//     per-process global state (thread pools, intra-op scheduler).
//     Multiple V8 isolates in the same process tend to step on each
//     other; a separate process is the well-trodden boundary.
//   - Crashes are fully contained: if a malformed input or a bad
//     dtype kills the worker, main + renderer keep running and we
//     re-spawn on the next request.
//
// Lifecycle: spawned lazily on first request from main.cjs, stays
// alive for the life of the app, holds one warm KokoroTTS handle
// keyed on (modelId, dtype, device). Communication is structured-
// clone over `process.parentPort` — no shared memory.

const { existsSync, mkdirSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");

// One handle per (modelId, dtype, device) tuple, lazily loaded on
// first request. Concurrent first-time requests coalesce on the same
// promise so we don't spawn N model loads.
const handles = new Map();

function modelKey(cfg) {
  return `${cfg.modelId}::${cfg.dtype}::${cfg.device}`;
}

async function loadHandle(cfg) {
  const key = modelKey(cfg);
  const existing = handles.get(key);
  if (existing) return existing;

  const promise = (async () => {
    // Configure transformers.js's env BEFORE kokoro-js touches it.
    // See packages/core/src/tts/kokoro-local.ts for the long version
    // of the same comment — kokoro-js re-exports a stub `env` that
    // only proxies wasmPaths, so any localModelPath / cacheDir /
    // allowRemoteModels assignment on the wrapper goes to a dead-
    // letter. We grab transformers.js's actual env via a direct
    // dynamic import.
    const tjs = await import("@huggingface/transformers");
    const env = tjs.env;

    const bundledRoot = process.env.NOTEBOOKLM_BUNDLED_MODELS_DIR;
    const expected = bundledRoot
      ? join(bundledRoot, "kokoro", ...cfg.modelId.split("/"))
      : null;
    if (expected && existsSync(expected)) {
      env.allowLocalModels = true;
      env.localModelPath = join(bundledRoot, "kokoro");
      env.allowRemoteModels = false;
      // biome-ignore lint/suspicious/noConsole: surfaces in desktop.log via main.cjs's stdio pipe
      console.log(
        `[tts-worker] bundled mode: localModelPath=${env.localModelPath} modelId=${cfg.modelId}`,
      );
    } else {
      const cacheDir =
        process.env.KOKORO_LOCAL_CACHE_DIR ||
        process.env.NOTEBOOKLM_MODEL_CACHE_DIR ||
        join(homedir(), ".cache", "huggingface");
      try {
        if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
      } catch {
        // load below will surface a clearer error if the dir really
        // can't be used.
      }
      env.cacheDir = cacheDir;
      env.allowRemoteModels = true;
      console.log(`[tts-worker] cache mode: cacheDir=${cacheDir}`);
    }

    const t0 = Date.now();
    const { KokoroTTS } = await import("kokoro-js");
    const handle = await KokoroTTS.from_pretrained(cfg.modelId, {
      dtype: cfg.dtype,
      device: cfg.device,
    });
    console.log(`[tts-worker] model ready in ${Date.now() - t0}ms`);
    return handle;
  })();

  handles.set(key, promise);
  // If load fails, evict so the next request retries instead of
  // returning the same rejected promise forever.
  promise.catch(() => handles.delete(key));
  return promise;
}

// 16-bit mono PCM WAV encoder. Matches the fallback in kokoro-local.ts
// — used when older kokoro-js versions don't expose `out.toWav()`.
function encodeWav(samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);

  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, 44 + i * 2);
  }
  return buf;
}

async function handleSpeak(payload) {
  const tts = await loadHandle({
    modelId: payload.modelId,
    dtype: payload.dtype,
    device: payload.device,
  });
  const out = await tts.generate(payload.text, { voice: payload.voice });
  const wav =
    typeof out.toWav === "function"
      ? Buffer.from(out.toWav())
      : encodeWav(out.audio, out.sampling_rate);
  return { wav, samplingRate: out.sampling_rate };
}

if (!process.parentPort) {
  console.error(
    "[tts-worker] process.parentPort is undefined — this script must be launched via Electron utilityProcess.fork(), not bare Node.",
  );
  process.exit(1);
}

process.parentPort.on("message", async (event) => {
  const msg = event.data;
  if (!msg || typeof msg.id !== "number" || typeof msg.type !== "string") {
    // Don't reply to malformed messages — the sender has no id to
    // correlate against. Surface a log so we can tell from desktop.log
    // that the bridge is mis-shaped.
    console.warn("[tts-worker] received malformed message:", msg);
    return;
  }
  const { id, type, payload } = msg;
  try {
    let result;
    if (type === "speak") {
      result = await handleSpeak(payload);
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

// Surface uncaught failures so they land in desktop.log. The main
// process will see the worker exit and respawn it on the next call.
process.on("uncaughtException", (err) => {
  console.error("[tts-worker] uncaughtException:", err.stack || err.message);
});
process.on("unhandledRejection", (reason) => {
  console.error(
    "[tts-worker] unhandledRejection:",
    reason instanceof Error ? reason.stack || reason.message : reason,
  );
});

console.log(`[tts-worker] started, pid=${process.pid}, node=${process.version}`);
