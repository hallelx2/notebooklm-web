import { eq } from "drizzle-orm";
import { decryptSecret } from "../crypto/secret";
import { userProviderCredentials } from "../db/schema";
import { coreDb } from "../runtime";

/**
 * Per-user TTS credential lookup.
 *
 * Mirrors the shape of `search/credentials.ts` but keyed on TTS-only
 * provider names. Today that's just Deepgram (the only TTS provider
 * that needs an API key — Kokoro local runs without one, Kokoro-FastAPI
 * uses a base URL not a key). Future TTS providers (ElevenLabs, OpenAI
 * TTS, etc.) drop in here.
 *
 * The audio-overview handler calls this with the requesting user's id
 * before falling back to `adapter.env.DEEPGRAM_API_KEY` so a saved
 * per-user key wins over the env-var default.
 */

export type TtsCredentialName = "deepgram";

export type ResolvedTtsCredential = {
  apiKey?: string;
  baseUrl?: string;
};

export async function resolveTtsCredential(
  userId: string | undefined,
  name: TtsCredentialName,
): Promise<ResolvedTtsCredential> {
  if (!userId) return {};
  const db = coreDb();
  const rows = await db
    .select()
    .from(userProviderCredentials)
    .where(eq(userProviderCredentials.userId, userId));
  const cred = rows.find((r) => r.provider === name);
  if (!cred) return {};
  let apiKey: string | undefined;
  if (cred.apiKeyCiphertext && cred.apiKeyIv && cred.apiKeyTag) {
    try {
      apiKey = decryptSecret(
        {
          ciphertext: Buffer.from(cred.apiKeyCiphertext, "base64"),
          iv: Buffer.from(cred.apiKeyIv, "base64"),
          tag: Buffer.from(cred.apiKeyTag, "base64"),
          keyVersion: cred.apiKeyKeyVersion,
        },
        userId,
      );
    } catch {
      // Encryption-key rotation or corruption — fall through, the
      // env-var default takes over.
    }
  }
  return { apiKey, baseUrl: cred.baseUrl ?? undefined };
}
