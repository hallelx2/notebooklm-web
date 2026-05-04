import { createAnthropic } from "@ai-sdk/anthropic";
import { createCohere } from "@ai-sdk/cohere";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createTogetherAI } from "@ai-sdk/togetherai";
import { createXai } from "@ai-sdk/xai";
import type { LanguageModel } from "ai";
import { and, eq } from "drizzle-orm";
import { decryptSecret } from "../crypto/secret";
import { userAiConfig, userProviderCredentials } from "../db/schema";
import { coreDb } from "../runtime";
import { getEmbedAdapter } from "./embed";
import { getProvider, isValidProviderId, type ProviderId } from "./providers";

/* ------------------------------------------------------------------ */
/*  Errors                                                             */
/* ------------------------------------------------------------------ */

/**
 * Thrown when the user has not finished onboarding (no chat or no embedding
 * provider configured). API routes should surface this as HTTP 412 with
 * `{ error: "NO_AI_CONFIG" }` so the client can redirect to settings.
 */
export class NoAiConfigError extends Error {
  readonly code = "NO_AI_CONFIG";
  constructor(public role: "chat" | "embedding") {
    super(`No ${role} provider configured for user`);
    this.name = "NoAiConfigError";
  }
}

/* ------------------------------------------------------------------ */
/*  Cache                                                              */
/* ------------------------------------------------------------------ */

const CACHE_MAX = 500;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  value: T;
  expires: number;
}

function makeCache<T>() {
  const map = new Map<string, CacheEntry<T>>();
  return {
    get(key: string): T | null {
      const e = map.get(key);
      if (!e) return null;
      if (e.expires < Date.now()) {
        map.delete(key);
        return null;
      }
      // bump to most-recently-used
      map.delete(key);
      map.set(key, e);
      return e.value;
    },
    set(key: string, value: T) {
      if (map.size >= CACHE_MAX) {
        const oldest = map.keys().next().value;
        if (oldest !== undefined) map.delete(oldest);
      }
      map.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
    },
    delete(prefix: string) {
      for (const k of map.keys()) {
        if (k.startsWith(prefix)) map.delete(k);
      }
    },
  };
}

const chatCache = makeCache<LanguageModel>();
const embedCache = makeCache<EmbedHandle>();

/** Manually invalidate caches for a user -- call after settings updates. */
export function invalidateUserAiCache(userId: string) {
  chatCache.delete(`${userId}:`);
  embedCache.delete(`${userId}:`);
}

/* ------------------------------------------------------------------ */
/*  Credential loading + decryption                                    */
/* ------------------------------------------------------------------ */

export interface ResolvedCredential {
  apiKey: string | undefined;
  baseUrl: string | null;
}

/**
 * Load + decrypt the user's saved credential for a provider. Throws
 * {@link NoAiConfigError} if no row exists. Exported so adapters that
 * need the raw key (e.g. the Claude Agent SDK runtime, which spawns a
 * subprocess and can't reuse our cached `LanguageModel` handle) can
 * resolve credentials without re-implementing decryption.
 */
export async function loadUserCredential(
  userId: string,
  providerId: ProviderId,
): Promise<ResolvedCredential> {
  return loadCredential(userId, providerId);
}

async function loadCredential(
  userId: string,
  providerId: ProviderId,
): Promise<ResolvedCredential> {
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

  if (!row) {
    throw new NoAiConfigError(providerId === "voyage" ? "embedding" : "chat");
  }

  let apiKey: string | undefined;
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

  return { apiKey, baseUrl: row.baseUrl };
}

/* ------------------------------------------------------------------ */
/*  Chat model factory                                                  */
/* ------------------------------------------------------------------ */

/**
 * Build the AI SDK `LanguageModel` for a user's currently-active chat
 * provider/model. Throws {@link NoAiConfigError} if the user has not
 * configured a chat provider yet.
 */
export async function getChatModel(userId: string): Promise<LanguageModel> {
  const db = coreDb();
  const [cfg] = await db
    .select()
    .from(userAiConfig)
    .where(eq(userAiConfig.userId, userId))
    .limit(1);

  if (!cfg?.chatProvider || !cfg?.chatModel) {
    throw new NoAiConfigError("chat");
  }
  if (!isValidProviderId(cfg.chatProvider)) {
    throw new Error(`Unknown chat provider: ${cfg.chatProvider}`);
  }

  const cacheKey = `${userId}:chat:${cfg.updatedAt.getTime()}:${cfg.chatProvider}:${cfg.chatModel}`;
  const cached = chatCache.get(cacheKey);
  if (cached) return cached;

  const credential = await loadCredential(userId, cfg.chatProvider);
  const model = buildChatModel(
    cfg.chatProvider,
    cfg.chatModel,
    credential.apiKey,
    credential.baseUrl,
  );
  chatCache.set(cacheKey, model);
  return model;
}

function buildChatModel(
  provider: ProviderId,
  modelId: string,
  apiKey: string | undefined,
  baseUrl: string | null,
): LanguageModel {
  const baseURL = baseUrl ?? undefined;

  switch (provider) {
    case "openai":
      return createOpenAI({ apiKey, baseURL })(modelId);
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "mistral":
      return createMistral({ apiKey, baseURL })(modelId);
    case "cohere":
      return createCohere({ apiKey, baseURL })(modelId);
    case "groq":
      return createGroq({ apiKey, baseURL })(modelId);
    case "xai":
      return createXai({ apiKey, baseURL })(modelId);
    case "together":
      return createTogetherAI({ apiKey, baseURL })(modelId);
    case "openrouter":
    case "ollama":
    case "openai_compatible": {
      const fallbackBase = getProvider(provider)?.defaultBaseUrl;
      const compat = createOpenAICompatible({
        name: provider,
        apiKey: apiKey ?? "",
        baseURL: baseURL ?? fallbackBase ?? "",
      });
      return compat(modelId);
    }
    case "voyage":
      throw new Error(
        "Voyage AI does not support chat -- pick a different chat provider.",
      );
    case "local":
      // The built-in `local` provider is embed-only (sentence-
      // transformers via @huggingface/transformers). Mirrors the
      // voyage case above — exhaustiveness sentinel for ProviderId.
      throw new Error(
        "The built-in local provider is embed-only -- pick a different chat provider.",
      );
  }
}

/* ------------------------------------------------------------------ */
/*  Embedding factory                                                   */
/* ------------------------------------------------------------------ */

export interface EmbedHandle {
  embed(texts: string[]): Promise<number[][]>;
  dim: number;
  model: string;
  provider: ProviderId;
}

/**
 * Build an embedding function for a user's currently-active embedding
 * provider/model. Throws {@link NoAiConfigError} if the user has not
 * configured an embedding provider yet.
 */
export async function getEmbedFn(userId: string): Promise<EmbedHandle> {
  const db = coreDb();
  const [cfg] = await db
    .select()
    .from(userAiConfig)
    .where(eq(userAiConfig.userId, userId))
    .limit(1);

  if (!cfg?.embeddingProvider || !cfg?.embeddingModel || !cfg?.embeddingDim) {
    throw new NoAiConfigError("embedding");
  }
  if (!isValidProviderId(cfg.embeddingProvider)) {
    throw new Error(`Unknown embedding provider: ${cfg.embeddingProvider}`);
  }

  const cacheKey = `${userId}:embed:${cfg.updatedAt.getTime()}:${cfg.embeddingProvider}:${cfg.embeddingModel}:${cfg.embeddingDim}`;
  const cached = embedCache.get(cacheKey);
  if (cached) return cached;

  const adapter = getEmbedAdapter(cfg.embeddingProvider);
  if (!adapter) {
    throw new Error(
      `Provider "${cfg.embeddingProvider}" does not support embeddings.`,
    );
  }

  const provider = cfg.embeddingProvider;
  const providerDef = getProvider(provider);
  const model = cfg.embeddingModel;
  const dim = cfg.embeddingDim;

  // `authType: "none"` providers (currently just the built-in `local`
  // sentence-transformers adapter) need no credentials at all -- skip
  // the credential lookup entirely so they work pre-onboarding.
  const credential =
    providerDef?.authType === "none"
      ? { apiKey: undefined, baseUrl: null }
      : await loadCredential(userId, provider);

  // Resolve final baseUrl: explicit credential overrides provider default.
  const fallbackBase = providerDef?.defaultBaseUrl;
  const finalBaseUrl = credential.baseUrl ?? fallbackBase ?? undefined;

  const handle: EmbedHandle = {
    dim,
    model,
    provider,
    async embed(texts: string[]) {
      return adapter.embed(texts, {
        apiKey: credential.apiKey,
        baseUrl: finalBaseUrl,
        model,
        dim,
      });
    },
  };

  embedCache.set(cacheKey, handle);
  return handle;
}

/* ------------------------------------------------------------------ */
/*  Stand-alone helpers (used by the "Test connection" flow)            */
/* ------------------------------------------------------------------ */

/**
 * Build a chat model from explicit credential params, bypassing the DB.
 * Used by the settings page's "Test connection" button before the
 * credential is saved.
 */
export function buildChatModelFromParams(params: {
  provider: ProviderId;
  model: string;
  apiKey?: string;
  baseUrl?: string | null;
}): LanguageModel {
  return buildChatModel(
    params.provider,
    params.model,
    params.apiKey,
    params.baseUrl ?? null,
  );
}

/**
 * Build an embed handle from explicit credential params, bypassing the DB.
 * Used by the settings page's "Test connection" button.
 */
export function buildEmbedHandleFromParams(params: {
  provider: ProviderId;
  model: string;
  dim: number;
  apiKey?: string;
  baseUrl?: string | null;
}): EmbedHandle {
  const adapter = getEmbedAdapter(params.provider);
  if (!adapter) {
    throw new Error(
      `Provider "${params.provider}" does not support embeddings.`,
    );
  }
  const providerDef = getProvider(params.provider);
  const fallbackBase = providerDef?.defaultBaseUrl;
  const finalBaseUrl = params.baseUrl ?? fallbackBase ?? undefined;

  return {
    dim: params.dim,
    model: params.model,
    provider: params.provider,
    async embed(texts: string[]) {
      return adapter.embed(texts, {
        apiKey: params.apiKey,
        baseUrl: finalBaseUrl,
        model: params.model,
        dim: params.dim,
      });
    },
  };
}
