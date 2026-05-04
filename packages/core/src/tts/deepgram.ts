import type { TtsProvider, TtsResult, TtsSegment } from "./types";

/**
 * Deepgram Aura voice mapping.
 *
 * Aura models live at https://developers.deepgram.com/docs/tts-models.
 * `aura-orion-en` is a warm male voice; `aura-asteria-en` is a bright female
 * voice — paired here to give the two-host podcast a recognizable contrast.
 */
const VOICE_MAP: Record<string, string> = {
  Alex: "aura-orion-en",
  Sam: "aura-asteria-en",
};

export type DeepgramTtsConfig = {
  apiKey: string;
  /** Override the host (e.g. for a Deepgram on-prem deployment). */
  baseUrl?: string;
};

export function createDeepgramTtsProvider(
  cfg: DeepgramTtsConfig,
): TtsProvider {
  const base = (cfg.baseUrl ?? "https://api.deepgram.com").replace(/\/+$/, "");
  return {
    name: "deepgram",
    async speak(segment: TtsSegment): Promise<TtsResult> {
      const voice = VOICE_MAP[segment.speaker] ?? "aura-asteria-en";
      const res = await fetch(`${base}/v1/speak?model=${voice}&encoding=mp3`, {
        method: "POST",
        headers: {
          Authorization: `Token ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: segment.text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Deepgram TTS ${res.status}: ${body || res.statusText}`,
        );
      }
      return {
        audio: Buffer.from(await res.arrayBuffer()),
        contentType: "audio/mpeg",
      };
    },
  };
}
