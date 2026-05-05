"use client";

import { useEffect, useState } from "react";
import { trpc } from "../../trpc/client";

/**
 * Wizard step #3 — embedding model.
 *
 * Two real choices for >95% of users:
 *
 *   1. Bundled (recommended): the BGE-Small ONNX shipped inside the
 *      installer. Zero setup, runs on CPU, 384-dim. Stored at
 *      /resources/embed/Xenova/bge-small-en-v1.5/. The local provider
 *      picks this up via NOTEBOOKLM_BUNDLED_MODELS_DIR.
 *   2. Same provider as chat: if the user picked OpenAI / Google /
 *      Cohere etc. for chat, those providers also do embeddings, so
 *      we can reuse the same key. One fewer credential to juggle.
 *
 * "Pick a different cloud provider" is a real but uncommon path —
 * available in Settings → Models for power users, not surfaced here.
 */

type Mode = "bundled" | "reuse_chat";

type ProviderEmbedDefault = {
  provider: string;
  model: string;
  dim: number;
  label: string;
};

const REUSE_DEFAULTS: Record<string, ProviderEmbedDefault> = {
  openai: {
    provider: "openai",
    model: "text-embedding-3-small",
    dim: 1536,
    label: "OpenAI text-embedding-3-small (1536d)",
  },
  google: {
    provider: "google",
    model: "gemini-embedding-001",
    dim: 768,
    label: "Google gemini-embedding-001 (768d)",
  },
  // Anthropic doesn't ship embeddings — falls back to bundled in the UI.
  anthropic: {
    provider: "openai",
    model: "text-embedding-3-small",
    dim: 1536,
    label: "(Anthropic has no embeddings — fall back to bundled)",
  },
  groq: {
    // Groq doesn't have embeddings either — show bundled as the option.
    provider: "openai",
    model: "text-embedding-3-small",
    dim: 1536,
    label: "(Groq has no embeddings — fall back to bundled)",
  },
  ollama: {
    provider: "ollama",
    model: "nomic-embed-text",
    dim: 768,
    label: "Ollama nomic-embed-text (768d)",
  },
};

export function EmbeddingStep({ onContinue }: { onContinue: () => void }) {
  const aiConfigQ = trpc.aiConfig.get.useQuery();
  const setAiConfig = trpc.aiConfig.update.useMutation();
  const utils = trpc.useUtils();

  const chatProvider = aiConfigQ.data?.chatProvider ?? null;
  const reuseDefault = chatProvider ? REUSE_DEFAULTS[chatProvider] : undefined;
  const reuseSupportsEmbed =
    !!reuseDefault &&
    !reuseDefault.label.startsWith("(") &&
    reuseDefault.provider === chatProvider;

  const [mode, setMode] = useState<Mode>("bundled");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Pre-select the user's existing embedding choice if they've been
  // here before (partial-onboarding resume).
  useEffect(() => {
    const existing = aiConfigQ.data?.embeddingProvider;
    if (existing === "local") setMode("bundled");
    else if (
      existing &&
      reuseDefault &&
      existing === reuseDefault.provider &&
      reuseSupportsEmbed
    )
      setMode("reuse_chat");
  }, [aiConfigQ.data, reuseDefault, reuseSupportsEmbed]);

  async function handleContinue() {
    setError(null);
    setSaving(true);
    try {
      if (mode === "bundled" || !reuseSupportsEmbed) {
        await setAiConfig.mutateAsync({
          embeddingProvider: "local",
          embeddingModel: "Xenova/bge-small-en-v1.5",
          embeddingDim: 384,
        });
      } else if (reuseDefault) {
        await setAiConfig.mutateAsync({
          embeddingProvider: reuseDefault.provider,
          embeddingModel: reuseDefault.model,
          embeddingDim: reuseDefault.dim,
        });
      }
      await utils.aiConfig.get.invalidate();
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-3">
          Step 3 · Required
        </p>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
          How should we index your sources?
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed max-w-xl">
          Embeddings are how the app finds relevant chunks of your
          documents when you ask questions. We need exactly one model
          for this — pick whichever you prefer.
        </p>
      </div>

      <div className="space-y-3">
        <Option
          active={mode === "bundled"}
          onClick={() => setMode("bundled")}
          icon="package_2"
          label="Built-in BGE-Small (recommended)"
          tagline="Zero setup · 384 dims · CPU"
          body="Ships inside the app — works offline, no API key, ~50MB of RAM in use. Good enough for >90% of retrieval workloads. Switch to a higher-dim model in Settings any time."
          badge="Free"
        />

        <Option
          active={mode === "reuse_chat"}
          onClick={() => reuseSupportsEmbed && setMode("reuse_chat")}
          disabled={!reuseSupportsEmbed}
          icon="link"
          label={
            chatProvider
              ? `Reuse your ${chatProvider} key`
              : "Reuse your chat provider"
          }
          tagline={
            reuseDefault?.label ?? "Pick a chat provider in step 2 first"
          }
          body={
            reuseSupportsEmbed
              ? "Skip a second key — uses the same credential you saved for chat. Slightly higher quality embeddings at the cost of an API call per chunk."
              : reuseDefault?.label.startsWith("(")
                ? `${chatProvider} doesn't offer embeddings, so the bundled model is the only path here unless you connect a third provider in Settings.`
                : "Available after step 2."
          }
        />
      </div>

      {error && (
        <div className="text-[11px] text-red-700 dark:text-red-300">{error}</div>
      )}

      <div>
        <button
          type="button"
          onClick={handleContinue}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black font-medium text-sm hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : "Continue"}
          <span className="material-symbols-outlined text-base">
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  );
}

function Option({
  active,
  disabled,
  onClick,
  icon,
  label,
  tagline,
  body,
  badge,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  tagline: string;
  body: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left rounded-xl border p-4 transition-all ${
        disabled
          ? "border-slate-200 dark:border-white/10 opacity-50 cursor-not-allowed"
          : active
            ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20"
            : "border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 bg-slate-50/40 dark:bg-white/[0.02]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-500/15 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-300 text-[18px]">
            {icon}
          </span>
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <h3 className="text-sm font-medium">{label}</h3>
            {badge && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                {badge}
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mb-1.5">
            {tagline}
          </p>
          <p className="text-xs text-slate-600 dark:text-zinc-400 leading-relaxed">
            {body}
          </p>
        </div>
      </div>
    </button>
  );
}
