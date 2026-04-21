import { google } from "@ai-sdk/google";
import { embedMany } from "ai";

const MODEL = "text-embedding-004";
export const EMBED_DIMS = 768;

export async function embedChunks(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    model: google.textEmbeddingModel(MODEL),
    values: texts,
  });
  return embeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedChunks([text]);
  return vec;
}
