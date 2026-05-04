import type { TtsAudioContentType } from "./types";

/**
 * Concatenate per-segment audio buffers from a single TTS provider into
 * one combined buffer suitable for upload.
 *
 * MP3 streams are byte-concatenable as-is (each MPEG-1 frame is self-
 * contained, decoders just keep reading frames until EOF).
 *
 * WAV is not — each segment carries its own RIFF/WAVE/fmt /data header,
 * and a decoder will stop at the first `data` chunk size. We strip the
 * header from segments 2+, concat the raw PCM, and patch the length
 * fields in the merged header.
 */
export function concatAudio(
  buffers: Buffer[],
  contentType: TtsAudioContentType,
): { audio: Buffer; contentType: TtsAudioContentType } {
  if (buffers.length === 0) {
    return { audio: Buffer.alloc(0), contentType };
  }
  if (buffers.length === 1) {
    const only = buffers[0] as Buffer;
    return { audio: only, contentType };
  }

  if (contentType === "audio/mpeg") {
    return { audio: Buffer.concat(buffers), contentType };
  }
  if (contentType === "audio/wav") {
    return { audio: concatWav(buffers), contentType };
  }
  // Exhaustiveness guard.
  const _never: never = contentType;
  throw new Error(`Unknown audio content type: ${_never}`);
}

/**
 * Pick the file extension to upload under. Storage URLs surface this in
 * the response so the `<audio>` element gets the right MIME inferred by
 * the browser even if our storage backend doesn't echo Content-Type.
 */
export function audioFileExtension(contentType: TtsAudioContentType): "mp3" | "wav" {
  return contentType === "audio/mpeg" ? "mp3" : "wav";
}

/**
 * Merge a sequence of complete RIFF/WAVE buffers. Assumes a 44-byte
 * canonical PCM header (fmt chunk = 16 bytes, no LIST/INFO chunks),
 * which is what kokoro-js emits and what our fallback encoder writes.
 */
function concatWav(buffers: Buffer[]): Buffer {
  const HEADER_SIZE = 44;
  const head = buffers[0] as Buffer;
  if (head.length < HEADER_SIZE) {
    throw new Error("First WAV buffer is shorter than a RIFF header");
  }
  // Strip everything but the PCM payload from each segment.
  const dataParts: Buffer[] = [head.subarray(HEADER_SIZE)];
  for (let i = 1; i < buffers.length; i++) {
    const b = buffers[i] as Buffer;
    dataParts.push(b.subarray(HEADER_SIZE));
  }
  const combined = Buffer.concat(dataParts);

  // Clone the first segment's header and patch the size fields.
  const newHeader = Buffer.from(head.subarray(0, HEADER_SIZE));
  // RIFF chunk size = total file size - 8 (the "RIFF" marker + size field itself)
  newHeader.writeUInt32LE(combined.length + HEADER_SIZE - 8, 4);
  // data chunk size = PCM bytes
  newHeader.writeUInt32LE(combined.length, 40);
  return Buffer.concat([newHeader, combined]);
}
