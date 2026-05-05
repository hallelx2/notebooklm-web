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
      // biome-ignore lint/suspicious/noExplicitAny: same optional-dep dance
      const tx = mod.env ?? (mod.default && mod.default.env);
      const tjs = (await import("@huggingface/transformers")) as {
        env: {
          cacheDir?: string;
          allowRemoteModels?: boolean;
          allowLocalModels?: boolean;
          localModelPath?: string;
        };
      };
      const env = tx ?? tjs.env;

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
      const msg = err instanceof Error ? err.message : String(err);
      if (/unable to get model file path or buffer/i.test(msg)) {
        // Add actionable context to a notoriously opaque transformers.js
        // error. Almost always one of: HF Hub unreachable, the cache
        // dir isn't writable, or a previous interrupted download left
        // a corrupt file.
        throw new TtsProviderUnavailableError(
          "kokoro",
          "kokoro-js couldn't load the ONNX model files. Common causes:\n" +
            `  • Network: this build downloads ${cfg.modelId} from huggingface.co. Check connectivity / proxy / antivirus.\n` +
            `  • Cache dir not writable: tried ${cacheDir}. Set KOKORO_LOCAL_CACHE_DIR to point at a writable directory.\n` +
            `  • Corrupt partial download: delete ${cacheDir}/hub/models--${cfg.modelId.replace("/", "--")} and retry.\n` +
            "If you already have Kokoro running locally via Python, the simplest fix is to use the FastAPI backend instead: spin up Kokoro-FastAPI and set KOKORO_BASE_URL.",
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
      const tts = await loadModel(resolved);
      const voice = voices[segment.speaker] ?? "af_bella";
      const out = (await tts.generate(segment.text, { voice })) as KokoroAudioOutput;

      // Newer kokoro-js exposes `toWav()`. Older versions only had the
      // Float32Array — fall back to our own encoder so this works
      // against both.
      const wav =
        typeof out.toWav === "function"
          ? Buffer.from(out.toWav())
          : encodeWav(out.audio, out.sampling_rate);

      return { audio: wav, contentType: "audio/wav" };
    },
  };
}
