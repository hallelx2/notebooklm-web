import "server-only";
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
import { db } from "@/db";
import { userAiConfig, userProviderCredentials } from "@/db/schema";
import { getEmbedAdapter } from "@/lib/ai/embed";
import {
  getProvider,
  isValidProviderId,
  type ProviderId,
} from "@/lib/ai/providers";
import { decryptSecret } from "@/lib/crypto/secret";

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

interface ResolvedCredential {
  apiKey: string | undefined;
  baseUrl: string | null;
}

async function loadCredential(
  userId: string,
  providerId: ProviderId,
): Promise<ResolvedCredential> {
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

  const credential = await loadCredential(userId, cfg.embeddingProvider);
  const provider = cfg.embeddingProvider;
  const model = cfg.embeddingModel;
  const dim = cfg.embeddingDim;

  // Resolve final baseUrl: explicit credential overrides provider default.
  const fallbackBase = getProvider(provider)?.defaultBaseUrl;
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
  const fallbackBase = getProvider(params.provider)?.defaultBaseUrl;
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
