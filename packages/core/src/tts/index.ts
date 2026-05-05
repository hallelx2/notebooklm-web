import { audioFileExtension, concatAudio } from "./concat-audio";
import { resolveTtsCredential } from "./credentials";
import { createDeepgramTtsProvider } from "./deepgram";
import { createKokoroHttpTtsProvider } from "./kokoro-http";
import { createKokoroLocalTtsProvider } from "./kokoro-local";
import {
  type TtsProvider,
  type TtsProviderName,
  TtsProviderUnavailableError,
} from "./types";

export {
  audioFileExtension,
  concatAudio,
  createDeepgramTtsProvider,
  createKokoroHttpTtsProvider,
  createKokoroLocalTtsProvider,
  resolveTtsCredential,
  TtsProviderUnavailableError,
};
export type { ResolvedTtsCredential, TtsCredentialName } from "./credentials";
export type {
  TtsAudioContentType,
  TtsProvider,
  TtsProviderName,
  TtsResult,
  TtsSegment,
  Speaker,
} from "./types";

/**
 * Configuration the audio-overview handler hands us. The `kokoro` block
 * has two backends: if `baseUrl` is set we go HTTP via Kokoro-FastAPI;
 * otherwise we use the in-process `kokoro-js` library, which needs no
 * external service. Both the desktop and web adapters can populate
 * either.
 */
export type TtsProvidersConfig = {
  deepgram?: { apiKey: string; baseUrl?: string };
  kokoro?: {
    /** When set, route through Kokoro-FastAPI at this URL. */
    baseUrl?: string;
    /** Optional bearer for the FastAPI server. */
    apiKey?: string;
    /** FastAPI: model id passed in the OpenAI-shaped request body. */
    model?: string;
    /** kokoro-js: HF model id (default: onnx-community/Kokoro-82M-v1.0-ONNX). */
    modelId?: string;
    /** kokoro-js: ONNX quantization. */
    dtype?: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
    /** kokoro-js: execution device. */
    device?: "cpu" | "webgpu" | "wasm";
    /** Speaker→voice map override (applies to both backends). */
    voiceMap?: Record<string, string>;
    /**
     * Allow callers to opt out of the in-process backend even when no
     * baseUrl is set. Useful for the web app to guarantee it never
     * tries to load kokoro-js inside a serverless function.
     */
    disableLocal?: boolean;
  };
};

/**
 * Resolve a concrete provider by name. If `requested` is omitted, the
 * first configured provider in priority order [kokoro → deepgram] wins
 * (local first, since Kokoro is free and offline).
 *
 * For the `kokoro` provider the resolver picks the backend automatically:
 *   - `baseUrl` set     → HTTP (Kokoro-FastAPI)
 *   - `baseUrl` unset   → in-process (`kokoro-js`)
 *
 * Throws {@link TtsProviderUnavailableError} when the requested provider
 * isn't configured.
 */
export function resolveTtsProvider(
  cfg: TtsProvidersConfig,
  requested?: TtsProviderName,
): TtsProvider {
  const kokoroAvailable =
    !!cfg.kokoro && (cfg.kokoro.baseUrl || !cfg.kokoro.disableLocal);
  const want: TtsProviderName | undefined =
    requested ??
    (kokoroAvailable ? "kokoro" : cfg.deepgram ? "deepgram" : undefined);

  if (!want) {
    throw new TtsProviderUnavailableError(
      "deepgram",
      "No TTS provider configured. Install kokoro-js (desktop), set " +
        "KOKORO_BASE_URL (server with Kokoro-FastAPI), or set " +
        "DEEPGRAM_API_KEY.",
    );
  }

  if (want === "kokoro") {
    if (!cfg.kokoro || !kokoroAvailable) {
      throw new TtsProviderUnavailableError(
        "kokoro",
        "Kokoro TTS is not configured. Either install kokoro-js for " +
          "in-process synthesis, or set KOKORO_BASE_URL to point at a " +
          "Kokoro-FastAPI server.",
      );
    }
    if (cfg.kokoro.baseUrl) {
      return createKokoroHttpTtsProvider({
        baseUrl: cfg.kokoro.baseUrl,
        apiKey: cfg.kokoro.apiKey,
        model: cfg.kokoro.model,
        voiceMap: cfg.kokoro.voiceMap,
      });
    }
    return createKokoroLocalTtsProvider({
      modelId: cfg.kokoro.modelId,
      dtype: cfg.kokoro.dtype,
      device: cfg.kokoro.device,
      voiceMap: cfg.kokoro.voiceMap,
    });
  }

  if (want === "deepgram") {
    if (!cfg.deepgram) {
      throw new TtsProviderUnavailableError(
        "deepgram",
        "Deepgram TTS is not configured. Set DEEPGRAM_API_KEY.",
      );
    }
    return createDeepgramTtsProvider(cfg.deepgram);
  }

  throw new TtsProviderUnavailableError(
    want,
    `Unknown TTS provider: ${want satisfies never}`,
  );
}

/**
 * Which provider names the server is configured to serve. UI uses this
 * to dim the picker options the backend would refuse.
 */
export function availableTtsProviders(
  cfg: TtsProvidersConfig,
): TtsProviderName[] {
  const out: TtsProviderName[] = [];
  if (cfg.kokoro && (cfg.kokoro.baseUrl || !cfg.kokoro.disableLocal)) {
    out.push("kokoro");
  }
  if (cfg.deepgram) out.push("deepgram");
  return out;
}

/** True if the kokoro backend will go through HTTP rather than in-process. */
export function isKokoroHttpBackend(cfg: TtsProvidersConfig): boolean {
  return !!cfg.kokoro?.baseUrl;
}
