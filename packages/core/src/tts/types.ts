/**
 * TTS provider abstraction.
 *
 * Three implementations live next to this file:
 *   - `deepgram.ts`     — cloud, Deepgram Aura voices, requires DEEPGRAM_API_KEY.
 *                          Emits MP3.
 *   - `kokoro-local.ts` — in-process via the `kokoro-js` library (transformers.js
 *                          + ONNX). Default Kokoro backend on desktop. No Docker,
 *                          no Python, no HTTP. Emits WAV.
 *   - `kokoro-http.ts`  — OpenAI-compatible client for a Kokoro-FastAPI server.
 *                          Used when KOKORO_BASE_URL is set, typically for the
 *                          web deployment where Kokoro runs as a sidecar
 *                          container. Emits MP3.
 *
 * The audio-overview handler picks one at request time based on either an
 * explicit `provider` field on the request body or the adapter's defaults.
 */

/** Logical speakers used by the podcast script generator. */
export type Speaker = "Alex" | "Sam";

export type TtsSegment = {
  speaker: Speaker;
  text: string;
};

export type TtsProviderName = "deepgram" | "kokoro";

export type TtsAudioContentType = "audio/mpeg" | "audio/wav";

export type TtsResult = {
  /** Raw audio bytes. */
  audio: Buffer;
  /** Mime type of `audio`. Determines how the handler concatenates segments. */
  contentType: TtsAudioContentType;
};

/**
 * Single contract every TTS backend implements. The audio-overview handler
 * only ever talks to this — no provider-specific branching escapes
 * `packages/core/src/tts/`.
 */
export interface TtsProvider {
  readonly name: TtsProviderName;
  /** Synthesize one segment (one speaker turn) into MP3 bytes. */
  speak(segment: TtsSegment): Promise<TtsResult>;
}

export class TtsProviderUnavailableError extends Error {
  constructor(
    public readonly provider: TtsProviderName,
    message: string,
  ) {
    super(message);
    this.name = "TtsProviderUnavailableError";
  }
}
