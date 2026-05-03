/**
 * Prompt for the `audio-script` studio kind — generates the podcast
 * dialogue JSON that the audio-overview handler then synthesises into
 * MP3 segments via Deepgram TTS. Verbatim port from
 * `packages/server/src/handlers/studio/audio-overview.ts`.
 */

const LENGTH_GUIDE: Record<string, string> = {
  short: "short conversation = 4-6 exchanges total",
  medium: "medium conversation = 8-12 exchanges total",
  long: "long deep-dive conversation = 15-20 exchanges total",
};

export function audioScriptPrompt(opts: {
  length: "short" | "medium" | "long";
  focus?: string;
  sourceContent: string;
}): string {
  const lengthGuide = LENGTH_GUIDE[opts.length] ?? LENGTH_GUIDE.medium;
  return `Generate a podcast-style conversation between two hosts discussing the source material.

Host A ("Alex") is the main explainer who presents key ideas clearly.
Host B ("Sam") asks insightful questions, adds reactions, and provides alternative perspectives.

Length guideline: ${lengthGuide}
${opts.focus ? `Focus area: ${opts.focus}` : "Cover the main topics comprehensively."}

Return ONLY valid JSON array: [{ "speaker": "Alex" | "Sam", "text": "..." }, ...]

Make it natural, conversational, engaging. Include:
- An introduction where Alex introduces the topic
- Back-and-forth discussion with Sam asking good questions
- Sam occasionally saying "That's fascinating" or "Wait, so you're saying..."
- A brief conclusion/summary

Source material:
${opts.sourceContent}`;
}
