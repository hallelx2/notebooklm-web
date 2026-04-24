const PARA_SPLIT = /\n{2,}/;
const HEADING_RE = /^(#{1,4})\s+(.+)$/m;
const TARGET_TOKENS = 600;
const MAX_TOKENS = 1200;
const CHARS_PER_TOKEN = 4;

export type Chunk = {
  ordinal: number;
  content: string;
  tokenCount: number;
  heading?: string; // section heading this chunk belongs to
};

export function chunkText(text: string, sourceTitle?: string): Chunk[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (!clean) return [];

  // Split into paragraphs
  const paragraphs = clean.split(PARA_SPLIT).filter((p) => p.trim());

  const chunks: Chunk[] = [];
  let currentChunk = "";
  let currentHeading = sourceTitle || "";
  let ordinal = 0;
  let lastSentence = "";

  for (const para of paragraphs) {
    // Check if paragraph is a heading
    const headingMatch = para.match(HEADING_RE);
    if (headingMatch) {
      // Flush current chunk if non-empty
      if (currentChunk.trim()) {
        chunks.push(makeChunk(currentChunk, ordinal++, currentHeading));
        lastSentence = extractLastSentence(currentChunk);
        currentChunk = lastSentence ? lastSentence + "\n\n" : "";
      }
      currentHeading = headingMatch[2].trim();
      continue; // don't include raw heading in chunk text
    }

    const paraTokens = Math.ceil(para.length / CHARS_PER_TOKEN);
    const currentTokens = Math.ceil(currentChunk.length / CHARS_PER_TOKEN);

    // If adding this paragraph would exceed max tokens
    if (currentTokens + paraTokens > MAX_TOKENS && currentChunk.trim()) {
      chunks.push(makeChunk(currentChunk, ordinal++, currentHeading));
      lastSentence = extractLastSentence(currentChunk);
      currentChunk = lastSentence ? lastSentence + "\n\n" : "";
    }

    currentChunk += (currentChunk ? "\n\n" : "") + para;

    // If single paragraph exceeds max, split at sentences
    if (paraTokens > MAX_TOKENS) {
      const sentences = splitSentences(para);
      currentChunk = "";
      let sentBuf = "";
      for (const sent of sentences) {
        if (
          Math.ceil((sentBuf + sent).length / CHARS_PER_TOKEN) >
            TARGET_TOKENS &&
          sentBuf
        ) {
          chunks.push(makeChunk(sentBuf, ordinal++, currentHeading));
          lastSentence = extractLastSentence(sentBuf);
          sentBuf = lastSentence ? lastSentence + " " : "";
        }
        sentBuf += (sentBuf ? " " : "") + sent;
      }
      currentChunk = sentBuf;
    }
  }

  // Flush remaining
  if (currentChunk.trim()) {
    chunks.push(makeChunk(currentChunk, ordinal++, currentHeading));
  }

  return chunks;
}

function makeChunk(
  text: string,
  ordinal: number,
  heading?: string,
): Chunk {
  const content = text.trim();
  return {
    ordinal,
    content,
    tokenCount: Math.ceil(content.length / CHARS_PER_TOKEN),
    heading: heading || undefined,
  };
}

function extractLastSentence(text: string): string {
  const sentences = splitSentences(text);
  return sentences.length > 0 ? sentences[sentences.length - 1] : "";
}

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
}
