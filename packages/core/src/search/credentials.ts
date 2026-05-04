import { and, eq } from "drizzle-orm";
import { decryptSecret } from "../crypto/secret";
import { userProviderCredentials } from "../db/schema";
import { coreDb } from "../runtime";
import { exaProvider } from "./exa";
import { searxngProvider } from "./searxng";
import { tavilyProvider } from "./tavily";
import type {
  ResolvedSearchCredential,
  SearchProviderDescriptor,
  SearchProviderName,
} from "./types";

/**
 * Static descriptor map. Lives here (rather than in `index.ts`) because
 * both `index.ts` (for the providers map) and the credential resolver
 * need it; keeping it under credentials.ts means there's no cycle —
 * `credentials.ts` imports the provider impls directly, `index.ts`
 * re-exports from here.
 */
export const searchProviderDescriptors: Record<
  SearchProviderName,
  SearchProviderDescriptor
> = {
  exa: exaProvider.descriptor,
  tavily: tavilyProvider.descriptor,
  searxng: searxngProvider.descriptor,
};

/**
 * Resolve the credential for a search provider, in order:
 *
 * 1. **Per-user**: look up `user_provider_credentials` for `(userId,
 *    providerId)`. Decrypt `apiKey` if present, read `baseUrl`
 *    directly. Same encryption scheme the AI providers use, same
 *    table — adding a search-provider row is the same flow as adding
 *    an OpenAI row.
 *
 * 2. **Env fallback**: read `process.env[descriptor.envVars.apiKey]`
 *    and `process.env[descriptor.envVars.baseUrl]` for any field the
 *    user didn't fill. Lets the web app's operator-managed env
 *    (Vercel project vars) keep working with zero code change.
 *
 * Returns whatever was found. Both fields can be undefined — the
 * caller (`isSearchProviderAvailable`, `webSearch`) decides what
 * "available" means via the descriptor's `required` flags.
 */
export async function resolveSearchCredential(
  userId: string | undefined,
  providerId: SearchProviderName,
): Promise<ResolvedSearchCredential> {
  const desc = searchProviderDescriptors[providerId];
  let apiKey: string | undefined;
  let baseUrl: string | undefined;

  if (userId) {
    try {
      const db = coreDb();
      const [row] = await db
        .select()
        .from(userProviderCredentials)
        .where(
          and(
            eq(userProviderCredentials.userId, userId),
            eq(userProviderCredentials.provider, providerId),
          ),
        )
        .orderBy(userProviderCredentials.createdAt)
        .limit(1);

      if (row) {
        if (row.apiKeyCiphertext && row.apiKeyIv && row.apiKeyTag) {
          apiKey = decryptSecret(
            {
              ciphertext: Buffer.from(row.apiKeyCiphertext, "base64"),
              iv: Buffer.from(row.apiKeyIv, "base64"),
              tag: Buffer.from(row.apiKeyTag, "base64"),
              keyVersion: row.apiKeyKeyVersion,
            },
            userId,
          );
        }
        if (row.baseUrl) baseUrl = row.baseUrl;
      }
    } catch {
      // DB unavailable / decryption error — don't break the request,
      // just fall through to env fallback. The original code's
      // env-only path always worked even with a half-broken DB.
    }
  }

  if (!apiKey && desc.envVars.apiKey) {
    apiKey = process.env[desc.envVars.apiKey] || undefined;
  }
  if (!baseUrl && desc.envVars.baseUrl) {
    baseUrl = process.env[desc.envVars.baseUrl] || undefined;
  }

  return { apiKey, baseUrl };
}

/**
 * Whether all of a provider's required fields resolve to a value for
 * this user. Used by `availableProviders` to filter the fallback chain
 * down to the providers that can actually run.
 */
export async function isSearchProviderAvailable(
  userId: string | undefined,
  providerId: SearchProviderName,
): Promise<boolean> {
  const desc = searchProviderDescriptors[providerId];
  const creds = await resolveSearchCredential(userId, providerId);
  return desc.fields.every((f) => {
    if (!f.required) return true;
    return f.key === "apiKey" ? !!creds.apiKey : !!creds.baseUrl;
  });
}
