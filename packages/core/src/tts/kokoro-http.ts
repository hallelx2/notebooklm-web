import type { TtsProvider, TtsResult, TtsSegment } from "./types";

/**
 * Kokoro TTS via Kokoro-FastAPI (HTTP backend).
 *
 * Used when the user has a Kokoro-FastAPI server reachable over HTTP —
 * typically the bundled `kokoro` service in docker/searxng/docker-
 * compose.yml. Web deployments use this; desktop installs prefer the
 * in-process `kokoro-local.ts` backend (no Docker required).
 *
 * Kokoro-FastAPI (https://github.com/remsky/Kokoro-FastAPI) exposes an
 * OpenAI-compatible `POST /v1/audio/speech` endpoint, so this provider
 * is a thin shim on top of `fetch`.
 *
 * Voices are named like `af_bella` (American Female), `am_adam`
 * (American Male), `bm_george` (British Male), etc. We pair a male/
 * female voice to mirror the Deepgram pairing.
 *
 * Auth: Kokoro-FastAPI by default does NOT require an API key, but it
 * accepts one through the `Authorization: Bearer …` header for
 * compatibility with OpenAI clients. We pass it if configured.
 */
const VOICE_MAP: Record<string, string> = {
  Alex: "am_michael",
  Sam: "af_bella",
};

export type KokoroHttpTtsConfig = {
  /**
   * OpenAI-compatible base URL, **without** the trailing `/audio/speech`.
   * Examples:
   *   - http://localhost:8880/v1   (Kokoro-FastAPI default)
   *   - http://192.168.1.10:8880/v1 (on a LAN box)
   */
  baseUrl: string;
  /** Optional bearer token. Most local Kokoro deployments don't need this. */
  apiKey?: string;
  /** Override the underlying model id. Default: `kokoro`. */
  model?: string;
  /**
   * Override the speaker→voice map. Useful if the user has a fine-tune
   * with custom voice slots.
   */
  voiceMap?: Record<string, string>;
};

export function createKokoroHttpTtsProvider(
  cfg: KokoroHttpTtsConfig,
): TtsProvider {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const model = cfg.model ?? "kokoro";
  const voices = cfg.voiceMap ?? VOICE_MAP;

  return {
    name: "kokoro",
    async speak(segment: TtsSegment): Promise<TtsResult> {
      const voice = voices[segment.speaker] ?? "af_bella";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

      const res = await fetch(`${base}/audio/speech`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          voice,
          input: segment.text,
          // Kokoro-FastAPI accepts mp3/opus/aac/flac/wav. We pick mp3
          // so the existing `Buffer.concat` in the handler keeps
          // working without re-muxing.
          response_format: "mp3",
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Kokoro TTS ${res.status}: ${body || res.statusText}`);
      }

      return {
        audio: Buffer.from(await res.arrayBuffer()),
        contentType: "audio/mpeg",
      };
    },
  };
}
