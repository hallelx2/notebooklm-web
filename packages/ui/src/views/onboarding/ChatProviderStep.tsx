"use client";

import { useEffect, useState } from "react";
import { trpc } from "../../trpc/client";
import { CodingAgentSubStep } from "./CodingAgentSubStep";

/**
 * Wizard step #2 — pick how the user wants to provide AI.
 *
 * Two top-level paths:
 *
 *   1. **Model path** (this file's main body) — pick a chat provider
 *      (Google, OpenAI, Anthropic, Groq, Ollama). Paste an API key,
 *      we encrypt + save it, set chatProvider/chatModel on the user.
 *
 *   2. **Coding-agent path** (`CodingAgentSubStep`) — route through
 *      a CLI subprocess the user already has authenticated:
 *      `claude`, `codex`, or `gh copilot`. No API key on our side;
 *      we just save the runtime preference.
 *
 * The split exists because a developer who already has Claude Code
 * or Codex installed has effectively already paid for an AI provider
 * — making them paste another API key is friction with no benefit.
 *
 * Required step — the user MUST pick something, otherwise chat /
 * studio / deep research can't run.
 */

type CuratedProvider = {
  id: "google" | "openai" | "anthropic" | "groq" | "ollama";
  label: string;
  tagline: string;
  authType: "api_key" | "base_url_only";
  signupUrl?: string;
  /** Models hard-coded for the wizard — the per-provider full list lives in Settings. */
  recommendedModel: string;
  recommendedModelLabel: string;
  /** What we tell the user about the cost / capability profile. */
  notes: string;
  /** Fastest free path label, if any. */
  freePath?: string;
};

const CURATED: CuratedProvider[] = [
  {
    id: "google",
    label: "Google Gemini",
    tagline: "Free tier — recommended starting point",
    authType: "api_key",
    signupUrl: "https://aistudio.google.com/app/apikey",
    recommendedModel: "gemini-2.0-flash-exp",
    recommendedModelLabel: "Gemini 2.0 Flash",
    notes: "Generous free tier, fast, supports long context.",
    freePath: "Free",
  },
  {
    id: "groq",
    label: "Groq",
    tagline: "Free tier — fastest inference available",
    authType: "api_key",
    signupUrl: "https://console.groq.com/keys",
    recommendedModel: "llama-3.3-70b-versatile",
    recommendedModelLabel: "Llama 3.3 70B",
    notes: "Free tier hits ~500 tokens/sec. Limited daily quota.",
    freePath: "Free",
  },
  {
    id: "openai",
    label: "OpenAI",
    tagline: "Paid — broad model catalog",
    authType: "api_key",
    signupUrl: "https://platform.openai.com/api-keys",
    recommendedModel: "gpt-4o-mini",
    recommendedModelLabel: "GPT-4o mini",
    notes: "Pay-per-token. GPT-4o mini is cheap and capable.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    tagline: "Paid — best for long-context reasoning",
    authType: "api_key",
    signupUrl: "https://console.anthropic.com/settings/keys",
    recommendedModel: "claude-3-5-haiku-latest",
    recommendedModelLabel: "Claude 3.5 Haiku",
    notes: "Pay-per-token. Strong at multi-step reasoning.",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    tagline: "Fully offline — runs models on your machine",
    authType: "base_url_only",
    recommendedModel: "llama3.2",
    recommendedModelLabel: "llama3.2",
    notes:
      "Install Ollama and pull a model first (`ollama pull llama3.2`). Zero cost, zero cloud.",
    freePath: "Local",
  },
];

type Path = "model" | "coding-agent" | null;

export function ChatProviderStep({
  onContinue,
}: {
  onContinue: () => void;
}) {
  const [path, setPath] = useState<Path>(null);
  const [selected, setSelected] = useState<CuratedProvider["id"] | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [pickedOllamaModel, setPickedOllamaModel] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    { ok: boolean; latencyMs?: number; message?: string } | null
  >(null);
  const [saving, setSaving] = useState(false);

  const upsertCred = trpc.provider.upsert.useMutation();
  const testConn = trpc.provider.test.useMutation();
  const setAiConfig = trpc.aiConfig.update.useMutation();
  const aiConfigQ = trpc.aiConfig.get.useQuery();
  // Detect installed runtimes on first paint. Cheap when nothing's
  // there (parallel timeouts ~2.5s) and useful enough that we just
  // fire it once and reuse the result for both paths.
  const detectQ = trpc.runtimes.detectAvailable.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  // Ollama-shaped subset, kept under the old name for the rest of
  // this component's body (model card path).
  const ollamaQ = { data: detectQ.data?.ollama, refetch: detectQ.refetch };
  const utils = trpc.useUtils();

  const provider = selected ? CURATED.find((c) => c.id === selected) : null;

  // If the user already has chat config from a prior partial run,
  // pre-select it so they can continue past this step instantly.
  useEffect(() => {
    const existing = aiConfigQ.data?.chatProvider;
    if (existing && CURATED.some((c) => c.id === existing) && !selected) {
      setSelected(existing as CuratedProvider["id"]);
    }
  }, [aiConfigQ.data?.chatProvider, selected]);

  async function handleTestAndSave() {
    if (!provider) return;
    setError(null);
    setTestResult(null);

    if (provider.authType === "api_key" && !apiKey.trim()) {
      setError("Paste your API key first.");
      return;
    }

    // For Ollama, the user picks from a list of pulled models we
    // auto-detected — that wins over the static `recommendedModel`
    // because the user can't run a model they haven't pulled.
    const modelToUse =
      provider.id === "ollama" && pickedOllamaModel
        ? pickedOllamaModel
        : provider.recommendedModel;

    try {
      setSaving(true);
      // 1) Save the credential
      await upsertCred.mutateAsync({
        provider: provider.id,
        label: "default",
        apiKey: provider.authType === "api_key" ? apiKey : undefined,
        baseUrl: provider.authType === "base_url_only" ? baseUrl : null,
      });

      // 2) Run a tiny generate against the recommended model to verify
      //    the credential actually works before we save it as the default.
      const t = await testConn.mutateAsync({
        provider: provider.id,
        kind: "chat",
        model: modelToUse,
        apiKey: provider.authType === "api_key" ? apiKey : undefined,
        baseUrl: provider.authType === "base_url_only" ? baseUrl : undefined,
      });
      if (!t.ok) {
        setTestResult({ ok: false, message: t.error });
        setError(
          `${provider.label} rejected the request: ${t.error}. Double-check the key / base URL and try again.`,
        );
        return;
      }
      setTestResult({ ok: true, latencyMs: t.latencyMs });

      // 3) Persist as the user's default chat provider.
      await setAiConfig.mutateAsync({
        chatProvider: provider.id,
        chatModel: modelToUse,
      });
      await utils.aiConfig.get.invalidate();
      onContinue();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // Path-picker — runs before the actual provider grid. Shown until
  // the user picks a top-level approach.
  if (path === null) {
    const codingAgentDetected =
      detectQ.data?.claude.ok ||
      detectQ.data?.codex.ok ||
      detectQ.data?.ghCopilot.ok;
    return (
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-3">
            Step 2 · Required
          </p>
          <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
            How do you want to provide AI?
          </h1>
          <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed max-w-xl">
            Two ways. Pick the one that matches what you already have —
            either way you can switch later in Settings.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPath("model")}
            className="text-left rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 bg-slate-50/40 dark:bg-white/[0.02] p-5 transition-all group"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[20px] text-indigo-500 dark:text-indigo-400">
                hub
              </span>
              <h3 className="text-base font-medium">Use a model directly</h3>
            </div>
            <p className="text-[12px] text-slate-600 dark:text-zinc-400 leading-relaxed mb-3">
              Cloud (Google, OpenAI, Anthropic, Groq) or fully local
              (Ollama). Paste an API key once and we encrypt it on disk.
            </p>
            <ul className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
              <li>· Free tiers available (Google, Groq)</li>
              <li>· Works for chat, audio summaries, deep research</li>
              {detectQ.data?.ollama.ok && (
                <li className="text-emerald-700 dark:text-emerald-300">
                  · Ollama detected on this machine
                </li>
              )}
            </ul>
          </button>

          <button
            type="button"
            onClick={() => setPath("coding-agent")}
            className={`text-left rounded-xl border p-5 transition-all group ${
              codingAgentDetected
                ? "border-emerald-300 dark:border-emerald-500/30 hover:border-emerald-500 dark:hover:border-emerald-400 bg-emerald-50/30 dark:bg-emerald-500/5"
                : "border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 bg-slate-50/40 dark:bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[20px] text-indigo-500 dark:text-indigo-400">
                terminal
              </span>
              <h3 className="text-base font-medium">Use my coding agent</h3>
              {codingAgentDetected && (
                <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                  Detected
                </span>
              )}
            </div>
            <p className="text-[12px] text-slate-600 dark:text-zinc-400 leading-relaxed mb-3">
              Route through Claude Code, OpenAI Codex, or
              `gh copilot`. Uses your existing CLI auth — no API key
              on our side.
            </p>
            <ul className="text-[11px] text-slate-500 dark:text-zinc-400 space-y-1">
              <li
                className={
                  detectQ.data?.claude.ok
                    ? "text-emerald-700 dark:text-emerald-300"
                    : ""
                }
              >
                · Claude Code{detectQ.data?.claude.ok ? " — installed" : ""}
              </li>
              <li
                className={
                  detectQ.data?.codex.ok
                    ? "text-emerald-700 dark:text-emerald-300"
                    : ""
                }
              >
                · OpenAI Codex{detectQ.data?.codex.ok ? " — installed" : ""}
              </li>
              <li
                className={
                  detectQ.data?.ghCopilot.ok
                    ? "text-emerald-700 dark:text-emerald-300"
                    : ""
                }
              >
                · GitHub Copilot
                {detectQ.data?.ghCopilot.ok ? " — installed" : ""}
              </li>
            </ul>
          </button>
        </div>

        {detectQ.isPending && (
          <p className="text-[11px] text-slate-500 dark:text-zinc-500 text-center">
            Probing your machine for installed runtimes...
          </p>
        )}
      </div>
    );
  }

  // Coding-agent branch: dispatched out to its own component.
  if (path === "coding-agent") {
    return (
      <CodingAgentSubStep
        onBack={() => setPath(null)}
        onContinue={onContinue}
      />
    );
  }

  // Model branch — the existing rich provider grid + Ollama
  // detection banner + configure form.
  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={() => setPath(null)}
          className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-3 inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">
            arrow_back
          </span>
          Choose a different path
        </button>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
          Pick your AI provider
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed max-w-xl">
          This is the model that answers your questions and writes
          summaries. Pick whichever you have access to — you can switch
          later in Settings.
        </p>
      </div>

      {/* "Detected on this machine" — only renders when Ollama is up. */}
      {ollamaQ.data?.ok && (
        <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">
              check_circle
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
              Detected on this machine — no API key needed
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelected("ollama");
              setError(null);
              setTestResult(null);
              setBaseUrl(ollamaQ.data?.baseUrl ?? "http://localhost:11434");
              if (
                ollamaQ.data?.models &&
                ollamaQ.data.models.length > 0 &&
                !pickedOllamaModel
              ) {
                setPickedOllamaModel(ollamaQ.data.models[0]?.name ?? null);
              }
            }}
            className={`w-full text-left rounded-lg border p-3 transition-all ${
              selected === "ollama"
                ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10"
                : "border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-400 dark:hover:border-emerald-500/40 bg-white dark:bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-medium">Ollama</h3>
                <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                  {ollamaQ.data.models.length > 0
                    ? `${ollamaQ.data.models.length} model${ollamaQ.data.models.length === 1 ? "" : "s"} pulled · ${ollamaQ.data.baseUrl} · ${ollamaQ.data.latencyMs}ms`
                    : `Server running at ${ollamaQ.data.baseUrl} — but no models pulled yet. Run \`ollama pull llama3.2\` first.`}
                </p>
              </div>
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-200 dark:bg-emerald-500/30 text-emerald-800 dark:text-emerald-200 shrink-0">
                Local
              </span>
            </div>
          </button>
        </div>
      )}

      {ollamaQ.data && !ollamaQ.data.ok && (
        <div className="text-[11px] text-slate-500 dark:text-zinc-500 px-1">
          <span className="material-symbols-outlined text-[12px] align-text-bottom mr-1">
            info
          </span>
          Tip: install <a
            href="https://ollama.com"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-900 dark:hover:text-white"
          >
            Ollama
          </a>{" "}
          for a fully-local, fully-free chat option (no API key needed).
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {CURATED.filter((c) =>
          // Don't show the Ollama card twice — the auto-detected
          // banner above replaces it when Ollama is up. When Ollama
          // is NOT up, fall through to the manual card so the user
          // can still configure it (e.g. Ollama on a LAN box).
          c.id === "ollama" ? !ollamaQ.data?.ok : true,
        ).map((c) => {
          const active = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setSelected(c.id);
                setError(null);
                setTestResult(null);
                setApiKey("");
              }}
              className={`text-left rounded-xl border p-4 transition-all ${
                active
                  ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20"
                  : "border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 bg-slate-50/40 dark:bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 className="text-sm font-medium">{c.label}</h3>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    {c.tagline}
                  </p>
                </div>
                {c.freePath && (
                  <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                    {c.freePath}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-snug">
                {c.notes}
              </p>
            </button>
          );
        })}
      </div>

      {provider && (
        <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50/40 dark:bg-white/[0.02] space-y-3">
          <div>
            <h3 className="text-sm font-medium mb-0.5">
              Configure {provider.label}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400">
              We'll use {provider.recommendedModelLabel} as the default.
              {provider.signupUrl && (
                <>
                  {" "}
                  <a
                    href={provider.signupUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline hover:text-slate-900 dark:hover:text-white"
                  >
                    Get a key →
                  </a>
                </>
              )}
            </p>
          </div>

          {provider.authType === "api_key" ? (
            <label className="block">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-zinc-300 mb-1">
                API key
              </div>
              <input
                type="password"
                autoFocus
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-... / AIza... / gsk_..."
                className="w-full bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-3 py-2 text-sm rounded focus:border-slate-900 dark:focus:border-white focus:outline-none"
              />
            </label>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-zinc-300 mb-1">
                  Base URL
                </div>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="http://localhost:11434"
                  className="w-full bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-3 py-2 text-sm rounded focus:border-slate-900 dark:focus:border-white focus:outline-none font-mono"
                />
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 mt-1">
                  Default Ollama port. Ensure the service is running and
                  at least one model is pulled.
                </p>
              </label>

              {/* Model picker — populated from `/api/tags`. Falls back
                  to a freeform input when detection didn't run or returned
                  zero models so the user can still type a model name. */}
              <label className="block">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-zinc-300 mb-1">
                  Model
                </div>
                {ollamaQ.data?.ok && ollamaQ.data.models.length > 0 ? (
                  <select
                    value={pickedOllamaModel ?? ""}
                    onChange={(e) => setPickedOllamaModel(e.target.value)}
                    className="w-full bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-3 py-2 text-sm rounded focus:border-slate-900 dark:focus:border-white focus:outline-none font-mono"
                  >
                    {ollamaQ.data.models.map((m) => (
                      <option key={m.name} value={m.name}>
                        {m.name}
                        {m.size
                          ? ` (${(m.size / 1024 / 1024 / 1024).toFixed(1)}GB)`
                          : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={pickedOllamaModel ?? ""}
                    onChange={(e) =>
                      setPickedOllamaModel(e.target.value || null)
                    }
                    placeholder="llama3.2"
                    className="w-full bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-3 py-2 text-sm rounded focus:border-slate-900 dark:focus:border-white focus:outline-none font-mono"
                  />
                )}
                {ollamaQ.data?.ok && ollamaQ.data.models.length === 0 && (
                  <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-1">
                    No models pulled yet — run{" "}
                    <code className="font-mono bg-amber-100 dark:bg-amber-500/15 px-1 py-0.5 rounded">
                      ollama pull llama3.2
                    </code>{" "}
                    in a terminal, then come back.
                  </p>
                )}
              </label>
            </div>
          )}

          {testResult?.ok && (
            <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[14px]">
                check_circle
              </span>
              Verified — {testResult.latencyMs}ms round-trip.
            </div>
          )}
          {error && (
            <div className="text-[11px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleTestAndSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black font-medium text-sm hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
                Testing & saving...
              </>
            ) : (
              <>
                Test & continue
                <span className="material-symbols-outlined text-base">
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
