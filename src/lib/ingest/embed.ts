const MODEL = "gemini-embedding-001";
export const EMBED_DIMS = 768;
const BATCH_SIZE = 90; // Google allows max 100 per batch request

function getApiKey(): string {
  const key =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
  return key;
}

/**
 * Call the Google Generative AI batchEmbedContents endpoint directly.
 * We bypass the AI SDK here because it does not pass `outputDimensionality`
 * through to the API, and `gemini-embedding-001` defaults to 3072 dims
 * while our pgvector column is 768.
 */
async function batchEmbed(texts: string[]): Promise<number[][]> {
  const apiKey = getApiKey();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${apiKey}`;

  const body = {
    requests: texts.map((text) => ({
      model: `models/${MODEL}`,
      content: { parts: [{ text }] },
      outputDimensionality: EMBED_DIMS,
    })),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Embedding API error ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    embeddings: { values: number[] }[];
  };

  return data.embeddings.map((e) => e.values);
}

export async function embedChunks(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  // Batch into groups of BATCH_SIZE to stay under the 100-request limit
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await batchEmbed(batch);
    allEmbeddings.push(...embeddings);
  }
  return allEmbeddings;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedChunks([text]);
  return vec;
}
