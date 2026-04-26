import "server-only";
import { z } from "zod";

/**
 * Lazy, validated access to process.env.
 *
 * Validation runs on first call to {@link getEnv} or any of the typed helpers.
 * We deliberately don't validate at module load to keep the dev experience
 * fast and to avoid breaking unrelated code paths if a single env var is
 * temporarily missing.
 */

function parseKey(s: string): Buffer | null {
  try {
    if (/^[0-9a-fA-F]{64}$/.test(s)) {
      return Buffer.from(s, "hex");
    }
    const buf = Buffer.from(s, "base64");
    return buf.length === 32 ? buf : null;
  } catch {
    return null;
  }
}

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1).optional(),

  // Better Auth
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),

  // Crypto -- required for AI provider settings (encrypts API keys at rest).
  ENCRYPTION_KEY: z
    .string()
    .refine(
      (s) => parseKey(s)?.length === 32,
      "ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars). Generate with: openssl rand -hex 32",
    )
    .optional(),

  // Maintainer's Google fallback (used as the default credential for legacy
  // users on the maintainer's own deployment until they set their own).
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  GOOGLE_GEMINI_API_KEY: z.string().optional(),

  // OAuth
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // Search providers
  EXA_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),
  SERPAPI_KEY: z.string().optional(),

  // Storage
  STORAGE_PROVIDER: z.string().optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  SUPABASE_BUCKET: z.string().optional(),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_BASE_URL: z.string().optional(),

  // Audio
  DEEPGRAM_API_KEY: z.string().optional(),

  // Vercel
  VERCEL_URL: z.string().optional(),
  VERCEL_PROJECT_PRODUCTION_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Returns the 32-byte encryption key as a Buffer.
 * Throws a helpful error if `ENCRYPTION_KEY` is missing or malformed.
 */
export function getEncryptionKey(): Buffer {
  const env = getEnv();
  if (!env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY env var is required for AI provider settings. " +
        "Generate one with: openssl rand -hex 32",
    );
  }
  const key = parseKey(env.ENCRYPTION_KEY);
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY must be 32 bytes (64 hex chars or 44 base64 chars).",
    );
  }
  return key;
}

/**
 * Returns the maintainer's default Google API key, if configured.
 * Used to seed legacy users with a working credential row during the cutover.
 */
export function getMaintainerGoogleKey(): string | null {
  const env = getEnv();
  return env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GOOGLE_GEMINI_API_KEY ?? null;
}
