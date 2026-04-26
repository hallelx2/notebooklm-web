/**
 * Static registry of AI providers and their built-in models.
 *
 * This file is the single source of truth for what shows up in the settings
 * dashboard. Adding a new provider here makes it appear in the UI; adding a
 * new model under an existing provider adds it to that provider's dropdown.
 *
 * Keep it static -- users supply credentials at runtime via the dashboard,
 * but the list of providers and their model catalog is shipped in code.
 *
 * The `openai_compatible` provider is special: it lets users add custom
 * model IDs at runtime so they can point at any OpenAI-shaped endpoint
 * (LM Studio, vLLM, Llama.cpp server, custom gateways, etc.).
 */

export type Capability = "chat" | "embed";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "mistral"
  | "cohere"
  | "voyage"
  | "groq"
  | "ollama"
  | "openrouter"
  | "together"
  | "xai"
  | "openai_compatible";

export type AuthType = "api_key" | "api_key_and_base_url" | "base_url_only";

export interface ModelDef {
  id: string;
  label: string;
  capabilities: Capability[];
  contextWindow?: number;
  /** Embedding dimension. Required if `capabilities` includes "embed". */
  embedDim?: number;
  deprecated?: boolean;
  description?: string;
}

export interface ProviderDef {
  id: ProviderId;
  label: string;
  /** Path under /providers/ (served by Next.js). */
  logo: string;
  authType: AuthType;
  baseUrlRequired: boolean;
  baseUrlPlaceholder?: string;
  defaultBaseUrl?: string;
  apiKeyDocsUrl?: string;
  /** If true, users may add models not listed in `models` (typed manually). */
  supportsCustomModels?: boolean;
  /** True if this provider only works on a self-hosted deployment (e.g. Ollama). */
  selfHostedOnly?: boolean;
  models: ModelDef[];
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: "openai",
    label: "OpenAI",
    logo: "/providers/openai.svg",
    authType: "api_key",
    baseUrlRequired: false,
    apiKeyDocsUrl: "https://platform.openai.com/api-keys",
    models: [
      {
        id: "gpt-4o",
        label: "GPT-4o",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "gpt-4o-mini",
        label: "GPT-4o mini",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "gpt-4-turbo",
        label: "GPT-4 Turbo",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "o1",
        label: "o1",
        capabilities: ["chat"],
        contextWindow: 200000,
      },
      {
        id: "o1-mini",
        label: "o1-mini",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "text-embedding-3-small",
        label: "text-embedding-3-small",
        capabilities: ["embed"],
        embedDim: 1536,
      },
      {
        id: "text-embedding-3-large",
        label: "text-embedding-3-large",
        capabilities: ["embed"],
        embedDim: 3072,
      },
      {
        id: "text-embedding-ada-002",
        label: "text-embedding-ada-002",
        capabilities: ["embed"],
        embedDim: 1536,
        deprecated: true,
      },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic",
    logo: "/providers/anthropic.svg",
    authType: "api_key",
    baseUrlRequired: false,
    apiKeyDocsUrl: "https://console.anthropic.com/settings/keys",
    models: [
      {
        id: "claude-opus-4-5-20250929",
        label: "Claude Opus 4.5",
        capabilities: ["chat"],
        contextWindow: 200000,
      },
      {
        id: "claude-sonnet-4-5-20250929",
        label: "Claude Sonnet 4.5",
        capabilities: ["chat"],
        contextWindow: 200000,
      },
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5",
        capabilities: ["chat"],
        contextWindow: 200000,
      },
      {
        id: "claude-3-5-sonnet-20241022",
        label: "Claude 3.5 Sonnet",
        capabilities: ["chat"],
        contextWindow: 200000,
      },
      {
        id: "claude-3-5-haiku-20241022",
        label: "Claude 3.5 Haiku",
        capabilities: ["chat"],
        contextWindow: 200000,
      },
    ],
  },
  {
    id: "google",
    label: "Google Gemini",
    logo: "/providers/google.svg",
    authType: "api_key",
    baseUrlRequired: false,
    apiKeyDocsUrl: "https://aistudio.google.com/apikey",
    models: [
      {
        id: "gemini-2.5-pro",
        label: "Gemini 2.5 Pro",
        capabilities: ["chat"],
        contextWindow: 2000000,
      },
      {
        id: "gemini-2.5-flash",
        label: "Gemini 2.5 Flash",
        capabilities: ["chat"],
        contextWindow: 1000000,
      },
      {
        id: "gemini-2.0-flash",
        label: "Gemini 2.0 Flash",
        capabilities: ["chat"],
        contextWindow: 1000000,
      },
      {
        id: "gemini-1.5-pro",
        label: "Gemini 1.5 Pro",
        capabilities: ["chat"],
        contextWindow: 2000000,
      },
      {
        id: "gemini-1.5-flash",
        label: "Gemini 1.5 Flash",
        capabilities: ["chat"],
        contextWindow: 1000000,
      },
      {
        id: "gemini-embedding-001",
        label: "Gemini Embedding 001",
        capabilities: ["embed"],
        embedDim: 768,
        description:
          "Truncated to 768 dims via outputDimensionality. Native size 3072.",
      },
    ],
  },
  {
    id: "mistral",
    label: "Mistral",
    logo: "/providers/mistral.svg",
    authType: "api_key",
    baseUrlRequired: false,
    apiKeyDocsUrl: "https://console.mistral.ai/api-keys",
    models: [
      {
        id: "mistral-large-latest",
        label: "Mistral Large",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "mistral-medium-latest",
        label: "Mistral Medium",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "mistral-small-latest",
        label: "Mistral Small",
        capabilities: ["chat"],
        contextWindow: 32000,
      },
      {
        id: "codestral-latest",
        label: "Codestral",
        capabilities: ["chat"],
        contextWindow: 32000,
      },
      {
        id: "mistral-embed",
        label: "Mistral Embed",
        capabilities: ["embed"],
        embedDim: 1024,
      },
    ],
  },
  {
    id: "cohere",
    label: "Cohere",
    logo: "/providers/cohere.svg",
    authType: "api_key",
    baseUrlRequired: false,
    apiKeyDocsUrl: "https://dashboard.cohere.com/api-keys",
    models: [
      {
        id: "command-a-03-2025",
        label: "Command A",
        capabilities: ["chat"],
        contextWindow: 256000,
      },
      {
        id: "command-r-plus",
        label: "Command R+",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "command-r",
        label: "Command R",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "embed-english-v3.0",
        label: "Embed English v3",
        capabilities: ["embed"],
        embedDim: 1024,
      },
      {
        id: "embed-multilingual-v3.0",
        label: "Embed Multilingual v3",
        capabilities: ["embed"],
        embedDim: 1024,
      },
      {
        id: "embed-english-light-v3.0",
        label: "Embed English Light v3",
        capabilities: ["embed"],
        embedDim: 384,
      },
    ],
  },
  {
    id: "voyage",
    label: "Voyage AI",
    logo: "/providers/voyage.svg",
    authType: "api_key",
    baseUrlRequired: false,
    apiKeyDocsUrl: "https://dashboard.voyageai.com/",
    models: [
      {
        id: "voyage-3-large",
        label: "Voyage 3 Large",
        capabilities: ["embed"],
        embedDim: 1024,
      },
      {
        id: "voyage-3",
        label: "Voyage 3",
        capabilities: ["embed"],
        embedDim: 1024,
      },
      {
        id: "voyage-3-lite",
        label: "Voyage 3 Lite",
        capabilities: ["embed"],
        embedDim: 512,
      },
      {
        id: "voyage-code-3",
        label: "Voyage Code 3",
        capabilities: ["embed"],
        embedDim: 1024,
      },
    ],
  },
  {
    id: "groq",
    label: "Groq",
    logo: "/providers/groq.svg",
    authType: "api_key",
    baseUrlRequired: false,
    apiKeyDocsUrl: "https://console.groq.com/keys",
    models: [
      {
        id: "llama-3.3-70b-versatile",
        label: "Llama 3.3 70B",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "llama-3.1-70b-versatile",
        label: "Llama 3.1 70B",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "llama-3.1-8b-instant",
        label: "Llama 3.1 8B Instant",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "mixtral-8x7b-32768",
        label: "Mixtral 8x7B",
        capabilities: ["chat"],
        contextWindow: 32768,
      },
      {
        id: "gemma2-9b-it",
        label: "Gemma 2 9B",
        capabilities: ["chat"],
        contextWindow: 8192,
      },
    ],
  },
  {
    id: "ollama",
    label: "Ollama",
    logo: "/providers/ollama.svg",
    authType: "base_url_only",
    baseUrlRequired: true,
    baseUrlPlaceholder: "http://localhost:11434",
    defaultBaseUrl: "http://localhost:11434",
    apiKeyDocsUrl: "https://ollama.com/library",
    selfHostedOnly: true,
    supportsCustomModels: true,
    models: [
      {
        id: "llama3.2",
        label: "Llama 3.2",
        capabilities: ["chat"],
      },
      {
        id: "llama3.1",
        label: "Llama 3.1",
        capabilities: ["chat"],
      },
      {
        id: "mistral",
        label: "Mistral",
        capabilities: ["chat"],
      },
      {
        id: "qwen2.5",
        label: "Qwen 2.5",
        capabilities: ["chat"],
      },
      {
        id: "nomic-embed-text",
        label: "Nomic Embed Text",
        capabilities: ["embed"],
        embedDim: 768,
      },
      {
        id: "mxbai-embed-large",
        label: "mxbai-embed-large",
        capabilities: ["embed"],
        embedDim: 1024,
      },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    logo: "/providers/openrouter.svg",
    authType: "api_key",
    baseUrlRequired: false,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    apiKeyDocsUrl: "https://openrouter.ai/keys",
    supportsCustomModels: true,
    models: [
      {
        id: "anthropic/claude-sonnet-4.5",
        label: "Claude Sonnet 4.5 (via OpenRouter)",
        capabilities: ["chat"],
        contextWindow: 200000,
      },
      {
        id: "openai/gpt-4o",
        label: "GPT-4o (via OpenRouter)",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
      {
        id: "google/gemini-2.5-flash",
        label: "Gemini 2.5 Flash (via OpenRouter)",
        capabilities: ["chat"],
        contextWindow: 1000000,
      },
      {
        id: "meta-llama/llama-3.3-70b-instruct",
        label: "Llama 3.3 70B (via OpenRouter)",
        capabilities: ["chat"],
        contextWindow: 128000,
      },
    ],
  },
  {
    id: "together",
    label: "Together AI",
    logo: "/providers/together.svg",
    authType: "api_key",
    baseUrlRequired: false,
    defaultBaseUrl: "https://api.together.xyz/v1",
    apiKeyDocsUrl: "https://api.together.xyz/settings/api-keys",
    supportsCustomModels: true,
    models: [
      {
        id: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
        label: "Llama 3.3 70B Turbo",
        capabilities: ["chat"],
        contextWindow: 131072,
      },
      {
        id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
        label: "Mixtral 8x7B Instruct",
        capabilities: ["chat"],
        contextWindow: 32768,
      },
      {
        id: "togethercomputer/m2-bert-80M-32k-retrieval",
        label: "M2-BERT 80M Retrieval",
        capabilities: ["embed"],
        embedDim: 768,
      },
      {
        id: "BAAI/bge-large-en-v1.5",
        label: "BGE Large EN v1.5",
        capabilities: ["embed"],
        embedDim: 1024,
      },
      {
        id: "WhereIsAI/UAE-Large-V1",
        label: "UAE Large V1",
        capabilities: ["embed"],
        embedDim: 1024,
      },
    ],
  },
  {
    id: "xai",
    label: "xAI",
    logo: "/providers/xai.svg",
    authType: "api_key",
    baseUrlRequired: false,
    defaultBaseUrl: "https://api.x.ai/v1",
    apiKeyDocsUrl: "https://console.x.ai/",
    models: [
      {
        id: "grok-2-latest",
        label: "Grok 2",
        capabilities: ["chat"],
        contextWindow: 131072,
      },
      {
        id: "grok-2-mini",
        label: "Grok 2 Mini",
        capabilities: ["chat"],
        contextWindow: 131072,
      },
      {
        id: "grok-beta",
        label: "Grok Beta",
        capabilities: ["chat"],
        contextWindow: 131072,
      },
    ],
  },
  {
    id: "openai_compatible",
    label: "OpenAI-compatible (custom)",
    logo: "/providers/openai_compatible.svg",
    authType: "api_key_and_base_url",
    baseUrlRequired: true,
    baseUrlPlaceholder: "https://your-host.example/v1",
    apiKeyDocsUrl: undefined,
    supportsCustomModels: true,
    models: [],
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const PROVIDER_INDEX = new Map(PROVIDERS.map((p) => [p.id, p]));

export function getProvider(id: ProviderId): ProviderDef | undefined {
  return PROVIDER_INDEX.get(id);
}

export function getModel(
  providerId: ProviderId,
  modelId: string,
): ModelDef | undefined {
  return getProvider(providerId)?.models.find((m) => m.id === modelId);
}

export function isValidProviderId(id: string): id is ProviderId {
  return PROVIDER_INDEX.has(id as ProviderId);
}

export function chatProviders(): ProviderDef[] {
  return PROVIDERS.filter(
    (p) =>
      p.supportsCustomModels ||
      p.models.some((m) => m.capabilities.includes("chat")),
  );
}

export function embedProviders(): ProviderDef[] {
  return PROVIDERS.filter(
    (p) =>
      p.supportsCustomModels ||
      p.models.some((m) => m.capabilities.includes("embed")),
  );
}

export function chatModels(providerId: ProviderId): ModelDef[] {
  return (
    getProvider(providerId)?.models.filter((m) =>
      m.capabilities.includes("chat"),
    ) ?? []
  );
}

export function embedModels(providerId: ProviderId): ModelDef[] {
  return (
    getProvider(providerId)?.models.filter((m) =>
      m.capabilities.includes("embed"),
    ) ?? []
  );
}

/**
 * The set of pgvector dimensions we have storage tables for.
 * If a model's dimension is not in this set, we cannot use it.
 */
export const SUPPORTED_EMBED_DIMS = [768, 1024, 1536, 3072] as const;
export type SupportedEmbedDim = (typeof SUPPORTED_EMBED_DIMS)[number];

export function isSupportedDim(n: number): n is SupportedEmbedDim {
  return (SUPPORTED_EMBED_DIMS as readonly number[]).includes(n);
}
