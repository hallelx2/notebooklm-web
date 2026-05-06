import type { TtsProvider, TtsResult, TtsSegment } from "./types";

/**
 * In-process Kokoro TTS via the `kokoro-js` library.
 *
 * Why this exists: the user already has the Kokoro model on disk. There's
 * no reason to spin up a Python container to wrap it — `kokoro-js`
 * (https://www.npmjs.com/package/kokoro-js) loads the ONNX export through
 * transformers.js and runs it in the same Node.js process as the rest of
 * the app. Zero Docker, zero subprocesses, zero HTTP roundtrip.
 *
 * Trade-offs vs. the FastAPI backend:
 *   + No external service to manage. Works offline. Cold-start adds a
 *     model load (~few seconds, then warm).
 *   + The model file is cached by transformers.js under
 *     `<HF_HOME>/hub/onnx-community--Kokoro-82M-v1.0-ONNX/` after the
 *     first run, or you can point at any ONNX-format Kokoro fork.
 *   - Doesn't fit Vercel's serverless runtime (cold-start budget,
 *     ephemeral filesystem, no GPU). For the web deployment, use the
 *     FastAPI backend or another cloud TTS.
 *
 * `kokoro-js` is intentionally an *optional* dep — we lazy-import it so
 * a web deployment that never touches local TTS doesn't pay the bundle
 * cost. If the import fails we throw a TtsProviderUnavailableError with
 * a useful install hint.
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { TtsProviderUnavailableError } from "./types";

export type KokoroLocalTtsConfig = {
  /**
   * Hugging Face model id passed to `KokoroTTS.from_pretrained`. Default
   * is the official ONNX export. Override to use a fine-tune or a local
   * snapshot path.
   */
  modelId?: string;
  /**
   * Quantization level. `q8` is the sweet spot — ~80MB, good quality,
   * runs fine on CPU. `fp32` is ~340MB and only worthwhile on GPU.
   */
  dtype?: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
  /**
   * Execution provider. `cpu` is the universal default. `webgpu` works
   * in browsers; `wasm` is the SIMD-WASM fallback. (kokoro-js doesn't
   * currently expose a CUDA/Node-GPU path — for GPU acceleration use
   * the FastAPI backend with the GPU image instead.)
   */
  device?: "cpu" | "webgpu" | "wasm";
  /** Override the speaker→voice map. */
  voiceMap?: Record<string, string>;
};

const DEFAULT_VOICE_MAP: Record<string, string> = {
  Alex: "am_michael",
  Sam: "af_bella",
};

const DEFAULT_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// Cached model handle. The model is many tens of MB so we never want to
// load it twice in the same process. We keep the *Promise* not the
// resolved value so concurrent first-time calls coalesce instead of
// kicking off N parallel loads.
//
// We type this loosely (`unknown`-ish) on purpose: kokoro-js is an
// optional dep, so we don't want to force `typeof import("kokoro-js")`
// into the public type surface — hosts that never call into it
// shouldn't even need its types resolvable.
type KokoroTtsHandle = {
  generate: (text: string, opts: unknown) => Promise<KokoroAudioOutput>;
};

let _modelPromise: Promise<KokoroTtsHandle> | null = null;
let _modelKey: string | null = null;

type KokoroAudioOutput = {
  /** PCM samples — mono Float32. */
  audio: Float32Array;
  /** Sample rate (24000 for Kokoro-82M). */
  sampling_rate: number;
  /** Encode the samples as a complete RIFF/WAVE byte stream. */
  toWav?: () => Uint8Array;
};

async function loadModel(
  cfg: Required<Pick<KokoroLocalTtsConfig, "modelId" | "dtype" | "device">>,
): Promise<KokoroTtsHandle> {
  const key = `${cfg.modelId}::${cfg.dtype}::${cfg.device}`;
  if (_modelPromise && _modelKey === key) return _modelPromise;
  _modelKey = key;
  _modelPromise = (async (): Promise<KokoroTtsHandle> => {
    // Loose typing here is deliberate — see the comment above the
    // KokoroTtsHandle type.
    // biome-ignore lint/suspicious/noExplicitAny: optional dep without a hard import
    let mod: any;
    try {
      // biome-ignore lint/suspicious/noExplicitAny: optional dep
      mod = (await import("kokoro-js")) as any;
    } catch (err) {
      throw new TtsProviderUnavailableError(
        "kokoro",
        "kokoro-js is not installed. Add it to the desktop app: " +
          "`bun add kokoro-js` — or set KOKORO_BASE_URL to point at a " +
          "Kokoro-FastAPI server instead. " +
          (err instanceof Error ? `(${err.message})` : ""),
      );
    }

    // CRITICAL: pin the cache dir to a real writable path BEFORE we
    // call from_pretrained.
    //
    // transformers.js's default `env.cacheDir` is derived from
    // `import.meta.url` of its own env.js. Under Vite SSR / Electron-
    // bundled main process that resolves to a virtual path that doesn't
    // exist on disk — the file-system cache silently no-ops on `put`,
    // and `match` returns undefined, so even after a successful HF
    // download the function reaches its
    // `throw new Error("Unable to get model file path or buffer.")`
    // branch. Symptom is a stuck retry loop with that exact message.
    //
    // Resolution priority — first hit wins:
    //   1. NOTEBOOKLM_BUNDLED_MODELS_DIR — packaged installer, resources
    //      shipped alongside the executable (no HF download).
    //   2. KOKORO_LOCAL_CACHE_DIR — explicit override
    //   3. NOTEBOOKLM_MODEL_CACHE_DIR — set by the desktop adapter
    //   4. ~/.cache/huggingface (canonical HF default — dev mode)
    let cacheDir = "(unresolved)";
    let bundledMode = false;
    try {
      // CRITICAL: configure the *transformers.js* env, not kokoro-js's.
      //
      // kokoro-js re-exports a stub object also called `env` that only
      // proxies `wasmPaths` — every other property assignment becomes a
      // dead-letter on the wrapper and never reaches transformers.js.
      // The previous `mod.env ?? tjs.env` fallback always took the
      // wrapper, so `localModelPath`, `allowRemoteModels`, etc. were
      // black-holed and transformers.js fell back to its in-asar default
      // `models/` directory, missed the file, fetched remotely, got a
      // `Response` (not `FileResponse`), then with `return_path=true`
      // couldn't satisfy the `instanceof FileResponse` check and threw
      // the generic "Unable to get model file path or buffer." That's
      // the failure the user saw on every packaged build despite the
      // bundled .onnx being right there on disk.
      const tjs = (await import("@huggingface/transformers")) as {
        env: {
          cacheDir?: string;
          allowRemoteModels?: boolean;
          allowLocalModels?: boolean;
          localModelPath?: string;
        };
      };
      const env = tjs.env;

      // If a bundled-models dir is set AND it actually contains the
      // weights for our model id, use it as a *local model path* rather
      // than as a cache dir. This is the packaged-installer path:
      // transformers.js never reaches out to HF Hub, never tries to
      // write to a cache, just reads from disk.
      const bundledRoot = process.env.NOTEBOOKLM_BUNDLED_MODELS_DIR;
      // Match the on-disk layout the prebuild script wrote:
      // <bundled>/kokoro/<org>/<repo>/...  — keep the slashes intact
      // because that's the layout transformers.js looks up when
      // localModelPath is set.
      const expected = bundledRoot
        ? join(bundledRoot, "kokoro", ...cfg.modelId.split("/"))
        : null;
      if (expected && existsSync(expected)) {
        env.allowLocalModels = true;
        env.localModelPath = join(bundledRoot as string, "kokoro");
        env.allowRemoteModels = false;
        cacheDir = `bundled:${expected}`;
        bundledMode = true;

        // Probe the actual files the loader will request. The wrapper
        // error message previously hid which file was missing — when
        // installs went wrong (partial extraction, antivirus quarantine,
        // wrong dtype suffix) the user only saw the generic "couldn't
        // load" message. Listing missing children here means the file
        // logger captures the exact gap the loader is going to trip on.
        // biome-ignore lint/suspicious/noConsole: dev-time diagnostic
        console.log(
          `[kokoro-local] bundled mode: localModelPath=${env.localModelPath} modelId=${cfg.modelId}`,
        );
        const dtypeSuffix =
          cfg.dtype === "fp32"
            ? ""
            : cfg.dtype === "fp16"
              ? "_fp16"
              : cfg.dtype === "q8"
                ? "_quantized"
                : cfg.dtype === "q4"
                  ? "_q4"
                  : cfg.dtype === "q4f16"
                    ? "_q4f16"
                    : "";
        const required = [
          "config.json",
          "tokenizer.json",
          "tokenizer_config.json",
          `onnx/model${dtypeSuffix}.onnx`,
        ];
        const missing = required.filter((f) => !existsSync(join(expected, f)));
        if (missing.length > 0) {
          // biome-ignore lint/suspicious/noConsole: dev-time diagnostic
          console.warn(
            `[kokoro-local] bundled dir is missing required files for dtype=${cfg.dtype}: ${missing.join(", ")}. ` +
              `Run \`bun run build:models\` from apps/desktop/ before packaging, or reinstall.`,
          );
        }
      } else {
        cacheDir = resolveCacheDir();
        env.cacheDir = cacheDir;
        env.allowRemoteModels = true;
      }
    } catch (err) {
      // We *deliberately* don't rethrow — the load below produces a
      // friendlier error. But leaving this entirely silent is what
      // burned us previously: a `ReferenceError: require is not defined`
      // from inside resolveCacheDir() got swallowed and the literal
      // "(unresolved)" leaked into the user-facing error message
      // before anyone noticed. So we surface a single visible
      // diagnostic line and keep going.
      // biome-ignore lint/suspicious/noConsole: dev-time diagnostic
      console.warn(
        "[kokoro-local] cache-dir setup failed — falling back to transformers.js default. " +
          "Underlying error:",
        err instanceof Error ? `${err.name}: ${err.message}` : err,
      );
    }

    // biome-ignore lint/suspicious/noConsole: dev-time progress signal
    console.log(
      `[kokoro-local] loading model ${cfg.modelId} (dtype=${cfg.dtype}, device=${cfg.device})\n` +
        `              cache=${cacheDir}\n` +
        `              first run downloads ~80MB of ONNX weights — please be patient`,
    );

    try {
      const t0 = Date.now();
      const handle = (await mod.KokoroTTS.from_pretrained(cfg.modelId, {
        dtype: cfg.dtype,
        device: cfg.device,
      })) as KokoroTtsHandle;
      // biome-ignore lint/suspicious/noConsole: dev-time progress signal
      console.log(`[kokoro-local] model ready in ${Date.now() - t0}ms`);
      return handle;
    } catch (err) {
      // Always log the underlying error first — the wrapper that follows
      // hides the stack and original message, which made the bundled-mode
      // failure mode opaque (the user-facing string blamed network /
      // cache, but the actual cause might be onnxruntime-node failing to
      // load its native binary, a missing ORT op, or an asar path issue).
      // The file logger picks this up so support can see what really went
      // wrong.
      // biome-ignore lint/suspicious/noConsole: critical diagnostic
      console.error(
        `[kokoro-local] from_pretrained failed (bundled=${bundledMode}, cache=${cacheDir})`,
        err instanceof Error ? err.stack || err.message : err,
      );
      const msg = err instanceof Error ? err.message : String(err);
      if (/unable to get model file path or buffer/i.test(msg)) {
        // Add actionable context to a notoriously opaque transformers.js
        // error. Almost always one of: HF Hub unreachable, the cache
        // dir isn't writable, or a previous interrupted download left
        // a corrupt file.
        const cause = bundledMode
          ? `  • Bundled model dir was found at ${cacheDir.replace(/^bundled:/, "")} but transformers.js couldn't read a file inside it. Check ${process.env.NOTEBOOKLM_DATA_DIR || "<DATA_DIR>"}/desktop.log for the underlying error (printed above this one).\n  • Antivirus / EDR sometimes quarantines large .onnx files in Program Files — rule out by reinstalling to a non-protected directory.\n`
          : `  • Network: this build downloads ${cfg.modelId} from huggingface.co. Check connectivity / proxy / antivirus.\n  • Cache dir not writable: tried ${cacheDir}. Set KOKORO_LOCAL_CACHE_DIR to point at a writable directory.\n  • Corrupt partial download: delete ${cacheDir}/hub/models--${cfg.modelId.replace("/", "--")} and retry.\n`;
        throw new TtsProviderUnavailableError(
          "kokoro",
          `kokoro-js couldn't load the ONNX model files. Common causes:\n${cause}If you already have Kokoro running locally via Python, the simplest fix is to use the FastAPI backend instead: spin up Kokoro-FastAPI and set KOKORO_BASE_URL.`,
        );
      }
      throw err;
    }
  })();
  return _modelPromise;
}

function resolveCacheDir(): string {
  // node:path / node:fs / node:os are imported at the top of the file —
  // they're statically resolvable in Node.js / Electron / Bun (anywhere
  // this provider runs server-side). The previous implementation tried
  // `require("node:path")` lazily, which throws `ReferenceError: require
  // is not defined` inside Vite's ESM SSR — silently caught by the
  // outer try in loadModel(), leaving cacheDir as the literal string
  // "(unresolved)" and our fix as dead code.
  const dir =
    process.env.KOKORO_LOCAL_CACHE_DIR ||
    process.env.NOTEBOOKLM_MODEL_CACHE_DIR ||
    join(homedir(), ".cache", "huggingface");

  // The hub.js writer expects the directory to exist before
  // `cache.put` is called.
  try {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  } catch {
    // If we genuinely can't create it (permissions etc) the load
    // below will still produce a clear error.
  }
  return dir;
}

/**
 * If kokoro-js doesn't expose `toWav` on its output (older versions
 * only had `save(path)` and a raw Float32Array), fall back to a hand-
 * rolled PCM WAV encoder. Kept compact: 16-bit mono PCM, header
 * exactly 44 bytes, which is what `concat-audio.ts` expects.
 */
function encodeWav(samples: Float32Array, sampleRate: number): Buffer {
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
  buf.writeUInt32LE(16, 16); // PCM fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(numChannels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    // Clamp + convert to int16 little-endian.
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buf.writeInt16LE(s < 0 ? s * 0x8000 : s * 0x7fff, 44 + i * 2);
  }
  return buf;
}

/**
 * Optional RPC hook the desktop main process publishes via
 * `globalThis.__notebooklmTtsRpc`. When present, we route every
 * `speak()` through it instead of running ONNX inference inside the
 * api-server's event loop. The signature is intentionally narrow —
 * just enough for the worker to do its job. Anything fancier
 * (cancellation, progress) can live on top.
 *
 * Type-only: we never import from the desktop package; the worker is
 * an injection point, not a dependency.
 */
type TtsRpc = (
  type: "speak",
  payload: {
    text: string;
    voice: string;
    modelId: string;
    dtype: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
    device: "cpu" | "webgpu" | "wasm";
  },
) => Promise<{ wav: Uint8Array; samplingRate: number }>;

function getRpc(): TtsRpc | null {
  // biome-ignore lint/suspicious/noExplicitAny: globalThis bridge from desktop main
  const fn = (globalThis as any).__notebooklmTtsRpc;
  return typeof fn === "function" ? (fn as TtsRpc) : null;
}

export function createKokoroLocalTtsProvider(
  cfg: KokoroLocalTtsConfig = {},
): TtsProvider {
  const resolved = {
    modelId: cfg.modelId ?? DEFAULT_MODEL_ID,
    dtype: cfg.dtype ?? "q8",
    device: cfg.device ?? "cpu",
  } as const;
  const voices = cfg.voiceMap ?? DEFAULT_VOICE_MAP;

  return {
    name: "kokoro",
    async speak(segment: TtsSegment): Promise<TtsResult> {
      const voice = voices[segment.speaker] ?? "af_bella";

      // Worker path: when the desktop main process has published a
      // utility-process bridge, every speak() gets shipped to it
      // instead of running inference here. Keeps the api-server's
      // event loop free to pump renderer fetches and Windows IPC
      // while ONNX is busy. The worker handles its own model load.
      const rpc = getRpc();
      if (rpc) {
        const result = await rpc("speak", {
          text: segment.text,
          voice,
          modelId: resolved.modelId,
          dtype: resolved.dtype,
          device: resolved.device,
        });
        // The worker already encoded a WAV (using kokoro-js's toWav
        // when available, our hand-rolled encoder otherwise) — we
        // just need to wrap the bytes Buffer-style for the rest of
        // the audio pipeline.
        return {
          audio: Buffer.from(result.wav),
          contentType: "audio/wav",
        };
      }

      // In-process path: dev mode under `bun run dev`, tests, server
      // deployments without a worker host. Same code as the original
      // synchronous implementation.
      const tts = await loadModel(resolved);
      const out = (await tts.generate(segment.text, { voice })) as KokoroAudioOutput;
      const wav =
        typeof out.toWav === "function"
          ? Buffer.from(out.toWav())
          : encodeWav(out.audio, out.sampling_rate);
      return { audio: wav, contentType: "audio/wav" };
    },
  };
}
