"use client";

import { useEffect, useState } from "react";
import { trpc } from "../../trpc/client";
import { CodingAgentSubStep } from "./CodingAgentSubStep";

/**
 * Wizard step #2 — pick how the user wants to provide AI.
 *
 * Two top-level paths:
 *
 * 1. **Model path** (this file's main body) — pick a chat provider
 * (Google, OpenAI, Anthropic, Groq, Ollama). Paste an API key,
 * we encrypt + save it, set chatProvider/chatModel on the user.
 *
 * 2. **Coding-agent path** (`CodingAgentSubStep`) — route through
 * a CLI subprocess the user already has authenticated:
 * `claude`, `codex`, or `gh copilot`. No API key on our side;
 * we just save the runtime preference.
 *
 * The split exists because a developer who already has Claude Code
 * or Codex installed has effectively already paid for an AI provider
 * — making them paste another API key is friction with no benefit.
 *
 * Required step — the user MUST pick something, otherwise chat /
 * studio / deep research can't run.
 */

type CuratedProvider = {
 id:
 | "google"
 | "groq"
 | "openai"
 | "anthropic"
 | "mistral"
 | "cohere"
 | "xai"
 | "together"
 | "openrouter"
 | "openai_compatible"
 | "ollama";
 label: string;
 tagline: string;
 authType: "api_key" | "base_url_only" | "api_key_and_base_url";
 signupUrl?: string;
 /** Models hard-coded for the wizard — the per-provider full list lives in Settings. */
 recommendedModel: string;
 recommendedModelLabel: string;
 /** What we tell the user about the cost / capability profile. */
 notes: string;
 /** Headline pricing/availability badge — drives the visual grouping. */
 freePath?: "Free" | "Paid" | "Local" | "Custom";
};

const CURATED: CuratedProvider[] = [
 // ── Free tier ─────────────────────────────────────────────────────
 {
 id: "google",
 label: "Google Gemini",
 tagline: "Free tier — recommended starting point",
 authType: "api_key",
 signupUrl: "https://aistudio.google.com/apikey",
 recommendedModel: "gemini-2.5-flash",
 recommendedModelLabel: "Gemini 2.5 Flash",
 notes: "Generous free tier, fast, 1M-token context window.",
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
 // ── Paid cloud ────────────────────────────────────────────────────
 {
 id: "openai",
 label: "OpenAI",
 tagline: "Paid — broad model catalog",
 authType: "api_key",
 signupUrl: "https://platform.openai.com/api-keys",
 recommendedModel: "gpt-4o-mini",
 recommendedModelLabel: "GPT-4o mini",
 notes: "Pay-per-token. GPT-4o mini is cheap and capable.",
 freePath: "Paid",
 },
 {
 id: "anthropic",
 label: "Anthropic",
 tagline: "Paid — best for long-context reasoning",
 authType: "api_key",
 signupUrl: "https://console.anthropic.com/settings/keys",
 recommendedModel: "claude-haiku-4-5-20251001",
 recommendedModelLabel: "Claude Haiku 4.5",
 notes: "Pay-per-token. Strongest multi-step reasoning at the price.",
 freePath: "Paid",
 },
 {
 id: "mistral",
 label: "Mistral",
 tagline: "Paid — European, frontier reasoning",
 authType: "api_key",
 signupUrl: "https://console.mistral.ai/api-keys",
 recommendedModel: "mistral-large-latest",
 recommendedModelLabel: "Mistral Large",
 notes: "EU-hosted inference. Strong at code, math, and multilingual.",
 freePath: "Paid",
 },
 {
 id: "cohere",
 label: "Cohere",
 tagline: "Paid — built for retrieval & RAG",
 authType: "api_key",
 signupUrl: "https://dashboard.cohere.com/api-keys",
 recommendedModel: "command-a-03-2025",
 recommendedModelLabel: "Command A",
 notes: "256k context. Tuned for RAG / tool-use workflows.",
 freePath: "Paid",
 },
 {
 id: "xai",
 label: "xAI",
 tagline: "Paid — Grok family",
 authType: "api_key",
 signupUrl: "https://console.x.ai/",
 recommendedModel: "grok-2-latest",
 recommendedModelLabel: "Grok 2",
 notes: "131k context. Conversational with web-aware reasoning.",
 freePath: "Paid",
 },
 // ── Aggregators ──────────────────────────────────────────────────
 {
 id: "together",
 label: "Together AI",
 tagline: "Paid — open-weights at scale",
 authType: "api_key",
 signupUrl: "https://api.together.xyz/settings/api-keys",
 recommendedModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
 recommendedModelLabel: "Llama 3.3 70B Turbo",
 notes: "Best-priced hosted Llama / Mixtral / open-weights inference.",
 freePath: "Paid",
 },
 {
 id: "openrouter",
 label: "OpenRouter",
 tagline: "Paid — one key, any model",
 authType: "api_key",
 signupUrl: "https://openrouter.ai/keys",
 recommendedModel: "anthropic/claude-sonnet-4.5",
 recommendedModelLabel: "Claude Sonnet 4.5 (via OpenRouter)",
 notes: "Single billing across Claude, GPT, Gemini, Llama and more.",
 freePath: "Paid",
 },
 // ── Local & custom ───────────────────────────────────────────────
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
 {
 id: "openai_compatible",
 label: "OpenAI-compatible (custom)",
 tagline: "Bring your own endpoint — LM Studio, vLLM, gateways",
 authType: "api_key_and_base_url",
 recommendedModel: "",
 recommendedModelLabel: "Custom model id",
 notes:
 "Point at any OpenAI-shaped /v1 endpoint and supply the model id you want to use.",
 freePath: "Custom",
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
 // Used by openai_compatible (and as fallback for any provider with
 // a freeform recommendedModel === ""): user types the model id.
 const [customModelId, setCustomModelId] = useState("");
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

 const needsApiKey =
 provider.authType === "api_key" ||
 provider.authType === "api_key_and_base_url";
 const needsBaseUrl =
 provider.authType === "base_url_only" ||
 provider.authType === "api_key_and_base_url";

 if (needsApiKey && !apiKey.trim()) {
 setError("Paste your API key first.");
 return;
 }
 if (needsBaseUrl && !baseUrl.trim()) {
 setError("Enter the base URL of your endpoint first.");
 return;
 }

 // Resolve the model to use:
 // - Ollama → user's selection from the auto-detected list
 // - openai_compatible / blank recommendedModel → user's typed id
 // - everything else → the curated recommendedModel
 const modelToUse =
 provider.id === "ollama" && pickedOllamaModel
 ? pickedOllamaModel
 : provider.recommendedModel || customModelId.trim();

 if (!modelToUse) {
 setError("Enter a model id to use.");
 return;
 }

 try {
 setSaving(true);
 // 1) Save the credential. Capture the saved row so we can test it
 // by credentialId in step 2 — the test mutation only persists
 // validationStatus="ok" back to the credential when it's looked
 // up by id, NOT when tested as a draft (provider+apiKey). Without
 // that, the saved credential stays "untested" in Settings even
 // though the user just succeeded here.
 const saved = await upsertCred.mutateAsync({
 provider: provider.id,
 label: "default",
 apiKey: needsApiKey ? apiKey : undefined,
 baseUrl: needsBaseUrl ? baseUrl : null,
 });

 // 2) Run a tiny generate against the recommended model to verify
 // the credential actually works AND mark the saved row's
 // validationStatus as "ok" so Settings shows it as Connected.
 const t = await testConn.mutateAsync({
 credentialId: saved.id,
 kind: "chat",
 model: modelToUse,
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
 <p className="text-[11px] font-bold uppercase tracking-widest text-fg-muted mb-3">
 Step 2 · Required
 </p>
 <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
 How do you want to provide AI?
 </h1>
 <p className="text-fg-secondary text-sm leading-relaxed max-w-xl">
 Two ways. Pick the one that matches what you already have —
 either way you can switch later in Settings.
 </p>
 </div>

 <div className="grid sm:grid-cols-2 gap-3">
 <button
 type="button"
 onClick={() => setPath("model")}
 className="text-left rounded-xl border border-border-subtle hover:border-border-strong bg-accent-soft p-5 transition-all group"
 >
 <div className="flex items-center gap-2 mb-2">
 <span className="material-symbols-outlined text-[20px] text-fg-accent">
 hub
 </span>
 <h3 className="text-base font-medium">Use a model directly</h3>
 </div>
 <p className="text-[12px] text-fg-secondary leading-relaxed mb-3">
 Cloud (Google, OpenAI, Anthropic, Groq) or fully local
 (Ollama). Paste an API key once and we encrypt it on disk.
 </p>
 <ul className="text-[11px] text-fg-muted space-y-1">
 <li>· Free tiers available (Google, Groq)</li>
 <li>· Works for chat, audio summaries, deep research</li>
 {detectQ.data?.ollama.ok && (
 <li className="text-success">
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
 ? "border-success/30 hover:border-success bg-success/5"
 : "border-border-subtle hover:border-border-strong bg-accent-soft"
 }`}
 >
 <div className="flex items-center gap-2 mb-2">
 <span className="material-symbols-outlined text-[20px] text-fg-accent">
 terminal
 </span>
 <h3 className="text-base font-medium">Use my coding agent</h3>
 {codingAgentDetected && (
 <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-success/15 text-success">
 Detected
 </span>
 )}
 </div>
 <p className="text-[12px] text-fg-secondary leading-relaxed mb-3">
 Route through Claude Code, OpenAI Codex, or
 `gh copilot`. Uses your existing CLI auth — no API key
 on our side.
 </p>
 <ul className="text-[11px] text-fg-muted space-y-1">
 <li
 className={
 detectQ.data?.claude.ok
 ? "text-success"
 : ""
 }
 >
 · Claude Code{detectQ.data?.claude.ok ? " — installed" : ""}
 </li>
 <li
 className={
 detectQ.data?.codex.ok
 ? "text-success"
 : ""
 }
 >
 · OpenAI Codex{detectQ.data?.codex.ok ? " — installed" : ""}
 </li>
 <li
 className={
 detectQ.data?.ghCopilot.ok
 ? "text-success"
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
 <p className="text-[11px] text-fg-muted text-center">
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
 className="text-[11px] font-bold uppercase tracking-widest text-fg-muted hover:text-fg transition-colors mb-3 inline-flex items-center gap-1"
 >
 <span className="material-symbols-outlined text-[14px]">
 arrow_back
 </span>
 Choose a different path
 </button>
 <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
 Pick your AI provider
 </h1>
 <p className="text-fg-secondary text-sm leading-relaxed max-w-xl">
 This is the model that answers your questions and writes
 summaries. Pick whichever you have access to — you can switch
 later in Settings.
 </p>
 </div>

 {/* "Detected on this machine" — only renders when Ollama is up. */}
 {ollamaQ.data?.ok && (
 <div className="rounded-xl border border-success/30 bg-success/5 p-4">
 <div className="flex items-center gap-2 mb-2">
 <span className="material-symbols-outlined text-[16px] text-success">
 check_circle
 </span>
 <span className="text-[10px] font-bold uppercase tracking-widest text-success">
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
 ? "border-fg-accent bg-accent-soft"
 : "border-success/20 hover:border-success/40 bg-white dark:bg-white/[0.02]"
 }`}
 >
 <div className="flex items-center justify-between gap-2">
 <div>
 <h3 className="text-sm font-medium">Ollama</h3>
 <p className="text-[11px] text-fg-muted mt-0.5">
 {ollamaQ.data.models.length > 0
 ? `${ollamaQ.data.models.length} model${ollamaQ.data.models.length === 1 ? "" : "s"} pulled · ${ollamaQ.data.baseUrl} · ${ollamaQ.data.latencyMs}ms`
 : `Server running at ${ollamaQ.data.baseUrl} — but no models pulled yet. Run \`ollama pull llama3.2\` first.`}
 </p>
 </div>
 <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-success/30 text-success shrink-0">
 Local
 </span>
 </div>
 </button>
 </div>
 )}

 {ollamaQ.data && !ollamaQ.data.ok && (
 <div className="text-[11px] text-fg-muted px-1">
 <span className="material-symbols-outlined text-[12px] align-text-bottom mr-1">
 info
 </span>
 Tip: install <a
 href="https://ollama.com"
 target="_blank"
 rel="noreferrer"
 className="underline hover:text-fg"
 >
 Ollama
 </a>{" "}
 for a fully-local, fully-free chat option (no API key needed).
 </div>
 )}

 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
 {CURATED.filter((c) =>
 // Don't show the Ollama card twice — the auto-detected
 // banner above replaces it when Ollama is up. When Ollama
 // is NOT up, fall through to the manual card so the user
 // can still configure it (e.g. Ollama on a LAN box).
 c.id === "ollama" ? !ollamaQ.data?.ok : true,
 ).map((c) => {
 const active = selected === c.id;
 const badgeTone =
 c.freePath === "Free" || c.freePath === "Local"
 ? "bg-success/15 text-success"
 : c.freePath === "Custom"
 ? "bg-fg-accent/15 text-fg-accent"
 : "bg-border-subtle text-fg-secondary";
 return (
 <button
 key={c.id}
 type="button"
 onClick={() => {
 setSelected(c.id);
 setError(null);
 setTestResult(null);
 setApiKey("");
 if (c.id === "openai_compatible") {
 setBaseUrl("");
 setPickedOllamaModel(null);
 }
 }}
 className={`text-left rounded-xl border p-4 transition-all ${
 active
 ? "border-fg-accent bg-accent-soft ring-2 ring-fg-accent/20"
 : "border-border-subtle hover:border-border-strong bg-accent-soft"
 }`}
 >
 <div className="flex items-start justify-between gap-2 mb-2">
 <div className="min-w-0">
 <h3 className="text-sm font-medium truncate">{c.label}</h3>
 <p className="text-[11px] text-fg-muted mt-0.5">
 {c.tagline}
 </p>
 </div>
 {c.freePath && (
 <span
 className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0 ${badgeTone}`}
 >
 {c.freePath}
 </span>
 )}
 </div>
 <p className="text-[11px] text-fg-secondary leading-snug">
 {c.notes}
 </p>
 </button>
 );
 })}
 </div>

 {provider && (
 <div className="rounded-xl border border-border-subtle p-4 bg-accent-soft space-y-3">
 <div>
 <h3 className="text-sm font-medium mb-0.5">
 Configure {provider.label}
 </h3>
 <p className="text-[11px] text-fg-muted">
 We'll use {provider.recommendedModelLabel} as the default.
 {provider.signupUrl && (
 <>
 {" "}
 <a
 href={provider.signupUrl}
 target="_blank"
 rel="noreferrer"
 className="underline hover:text-fg"
 >
 Get a key →
 </a>
 </>
 )}
 </p>
 </div>

 {provider.authType === "api_key" ? (
 <label className="block">
 <div className="text-[10px] font-bold uppercase tracking-widest text-fg-secondary mb-1">
 API key
 </div>
 <input
 type="password"
 autoFocus
 value={apiKey}
 onChange={(e) => setApiKey(e.target.value)}
 placeholder="sk-... / AIza... / gsk_..."
 className="w-full bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none"
 />
 </label>
 ) : provider.authType === "api_key_and_base_url" ? (
 <div className="space-y-3">
 <label className="block">
 <div className="text-[10px] font-bold uppercase tracking-widest text-fg-secondary mb-1">
 API key
 </div>
 <input
 type="password"
 autoFocus
 value={apiKey}
 onChange={(e) => setApiKey(e.target.value)}
 placeholder="sk-..."
 className="w-full bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none"
 />
 </label>
 <label className="block">
 <div className="text-[10px] font-bold uppercase tracking-widest text-fg-secondary mb-1">
 Base URL
 </div>
 <input
 type="text"
 value={baseUrl}
 onChange={(e) => setBaseUrl(e.target.value)}
 placeholder="https://your-host.example/v1"
 className="w-full bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none font-mono"
 />
 </label>
 <label className="block">
 <div className="text-[10px] font-bold uppercase tracking-widest text-fg-secondary mb-1">
 Model id
 </div>
 <input
 type="text"
 value={customModelId}
 onChange={(e) => setCustomModelId(e.target.value)}
 placeholder="e.g. llama-3.1-8b-instruct"
 className="w-full bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none font-mono"
 />
 <p className="text-[10px] text-fg-muted mt-1">
 Whatever model id your endpoint accepts in the OpenAI{" "}
 <code className="font-mono">/v1/chat/completions</code> body.
 </p>
 </label>
 </div>
 ) : (
 <div className="space-y-3">
 <label className="block">
 <div className="text-[10px] font-bold uppercase tracking-widest text-fg-secondary mb-1">
 Base URL
 </div>
 <input
 type="text"
 value={baseUrl}
 onChange={(e) => setBaseUrl(e.target.value)}
 placeholder="http://localhost:11434"
 className="w-full bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none font-mono"
 />
 <p className="text-[10px] text-fg-muted mt-1">
 Default Ollama port. Ensure the service is running and
 at least one model is pulled.
 </p>
 </label>

 {/* Model picker — populated from `/api/tags`. Falls back
 to a freeform input when detection didn't run or returned
 zero models so the user can still type a model name. */}
 <label className="block">
 <div className="text-[10px] font-bold uppercase tracking-widest text-fg-secondary mb-1">
 Model
 </div>
 {ollamaQ.data?.ok && ollamaQ.data.models.length > 0 ? (
 <select
 value={pickedOllamaModel ?? ""}
 onChange={(e) => setPickedOllamaModel(e.target.value)}
 className="w-full bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none font-mono"
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
 className="w-full bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none font-mono"
 />
 )}
 {ollamaQ.data?.ok && ollamaQ.data.models.length === 0 && (
 <p className="text-[10px] text-warning mt-1">
 No models pulled yet — run{" "}
 <code className="font-mono bg-warning/15 px-1 py-0.5 rounded">
 ollama pull llama3.2
 </code>{" "}
 in a terminal, then come back.
 </p>
 )}
 </label>
 </div>
 )}

 {testResult?.ok && (
 <div className="text-[11px] text-success flex items-center gap-1.5">
 <span className="material-symbols-outlined text-[14px]">
 check_circle
 </span>
 Verified — {testResult.latencyMs}ms round-trip.
 </div>
 )}
 {error && (
 <div className="text-[11px] text-danger">
 {error}
 </div>
 )}

 <button
 type="button"
 onClick={handleTestAndSave}
 disabled={saving}
 className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-fg text-fg-inverted font-medium text-sm hover:bg-fg-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
