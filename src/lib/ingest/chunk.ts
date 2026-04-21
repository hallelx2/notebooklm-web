const TARGET_TOKENS = 800;
const OVERLAP_TOKENS = 120;
const CHARS_PER_TOKEN = 4; // rough heuristic

export type Chunk = { ordinal: number; content: string; tokenCount: number };

export function chunkText(text: string): Chunk[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const targetChars = TARGET_TOKENS * CHARS_PER_TOKEN;
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN;

  const chunks: Chunk[] = [];
  let start = 0;
  let ordinal = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + targetChars);
    if (end < clean.length) {
      const sentenceBreak = clean.lastIndexOf(". ", end);
      if (sentenceBreak > start + targetChars / 2) end = sentenceBreak + 1;
    }
    const slice = clean.slice(start, end).trim();
    if (slice) {
      chunks.push({
        ordinal: ordinal++,
        content: slice,
        tokenCount: Math.ceil(slice.length / CHARS_PER_TOKEN),
      });
    }
    if (end >= clean.length) break;
    start = Math.max(end - overlapChars, start + 1);
  }
  return chunks;
}
