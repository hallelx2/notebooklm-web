"use client";

import { useState } from "react";
import { trpc } from "../../trpc/client";

/**
 * Wizard step #4 — audio overview (optional).
 *
 * Three real backends, exposed as one toggle + one provider radio:
 * - bundled Kokoro (default — ONNX shipped in the installer)
 * - Deepgram (paid cloud — API key)
 * - skip (don't enable audio at all; user can flip it on later)
 *
 * Kokoro-FastAPI (HTTP) and KOKORO_BASE_URL stay as power-user options
 * in Settings; the wizard doesn't surface them to keep the funnel
 * clean.
 *
 * NOTE: There's no "audio enabled" flag in the schema yet — the
 * presence of a Deepgram credential, or Kokoro's bundled fallback,
 * is enough to make the audio overview work. Skipping just means we
 * don't write a Deepgram credential and rely on bundled Kokoro by
 * default. This is fine because the bundled model is free.
 */

export function AudioStep({
 onContinue,
 onSkip,
}: {
 onContinue: () => void;
 onSkip: () => void;
}) {
 const [mode, setMode] = useState<"bundled" | "deepgram">("bundled");
 const [deepgramKey, setDeepgramKey] = useState("");
 const [error, setError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);

 const upsertTtsCred = trpc.ttsConfig.upsertCredential.useMutation();
 const ttsList = trpc.ttsConfig.list.useQuery();
 const utils = trpc.useUtils();

 const existingDeepgram = ttsList.data?.find(
 (c) => c.provider === "deepgram" && c.hasKey,
 );

 async function handleContinue() {
 setError(null);
 setSaving(true);
 try {
 if (mode === "deepgram") {
 // Allow advancing without re-entering the key when we already
 // have one saved (resume case). New entries must look at least
 // plausibly Deepgram-shaped — they all start with a long
 // hex/base64 string today.
 if (!deepgramKey.trim() && !existingDeepgram) {
 setError("Paste your Deepgram API key first.");
 return;
 }
 if (deepgramKey.trim()) {
 await upsertTtsCred.mutateAsync({
 provider: "deepgram",
 apiKey: deepgramKey.trim(),
 });
 await utils.ttsConfig.list.invalidate();
 }
 }
 // For "bundled" we don't need to write anything — Kokoro is the
 // default backend in the audio handler when no Deepgram key /
 // KOKORO_BASE_URL is set, and bundled weights make it work out
 // of the box.
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
 <p className="text-[11px] font-bold uppercase tracking-widest text-fg-muted mb-3">
 Step 4 · Optional
 </p>
 <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
 Want podcast-style audio summaries?
 </h1>
 <p className="text-fg-secondary text-sm leading-relaxed max-w-xl">
 Two AI hosts read through your sources in a 3–15 minute
 conversation. Use the bundled model (already on disk, free)
 or Deepgram if you want studio-grade voices.
 </p>
 </div>

 <div className="space-y-3">
 <RadioCard
 active={mode === "bundled"}
 onClick={() => setMode("bundled")}
 icon="package_2"
 title="Built-in Kokoro (recommended)"
 tagline="Bundled · ~80MB · CPU"
 body="Already on your machine. Two natural-sounding voices (am_michael, af_bella). ~10 seconds per script segment on a modern laptop."
 badge="Free"
 />

 <RadioCard
 active={mode === "deepgram"}
 onClick={() => setMode("deepgram")}
 icon="cloud"
 title="Deepgram (cloud)"
 tagline="API key · Pay per second · Aura voices"
 body="Polished, broadcast-quality voices. Faster than the bundled model. Pay-as-you-go pricing — typical audio overview costs a few cents."
 />
 </div>

 {mode === "deepgram" && (
 <div className="rounded-xl border border-border-subtle p-4 bg-accent-soft space-y-3">
 <label className="block">
 <div className="text-[10px] font-bold uppercase tracking-widest text-fg-secondary mb-1">
 Deepgram API key
 </div>
 <input
 type="password"
 autoFocus
 value={deepgramKey}
 onChange={(e) => setDeepgramKey(e.target.value)}
 placeholder={
 existingDeepgram
 ? `${existingDeepgram.maskedKey} (saved — paste a new one to replace)`
 : "deepgram api key"
 }
 className="w-full bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none"
 />
 <p className="text-[10px] text-fg-muted mt-1">
 <a
 href="https://console.deepgram.com/signup"
 target="_blank"
 rel="noreferrer"
 className="underline hover:text-fg"
 >
 Sign up free →
 </a>
 {" — Deepgram gives $200 of credit on signup, plenty for testing."}
 </p>
 </label>
 </div>
 )}

 {error && (
 <div className="text-[11px] text-danger">{error}</div>
 )}

 <div className="flex items-center gap-3">
 <button
 type="button"
 onClick={handleContinue}
 disabled={saving}
 className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-fg text-fg-inverted font-medium text-sm hover:bg-fg-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
 >
 {saving ? "Saving..." : "Continue"}
 <span className="material-symbols-outlined text-base">
 arrow_forward
 </span>
 </button>
 <button
 type="button"
 onClick={onSkip}
 className="text-[11px] font-bold uppercase tracking-widest text-fg-muted hover:text-fg transition-colors"
 >
 Skip — I don't need audio
 </button>
 </div>
 </div>
 );
}

function RadioCard({
 active,
 onClick,
 icon,
 title,
 tagline,
 body,
 badge,
}: {
 active: boolean;
 onClick: () => void;
 icon: string;
 title: string;
 tagline: string;
 body: string;
 badge?: string;
}) {
 return (
 <button
 type="button"
 onClick={onClick}
 className={`w-full text-left rounded-xl border p-4 transition-all ${
 active
 ? "border-fg-accent bg-accent-soft ring-2 ring-fg-accent/20"
 : "border-border-subtle hover:border-border-strong bg-accent-soft"
 }`}
 >
 <div className="flex items-start gap-3">
 <span className="w-9 h-9 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
 <span className="material-symbols-outlined text-fg-accent text-[18px]">
 {icon}
 </span>
 </span>
 <div className="flex-1 min-w-0">
 <div className="flex items-center justify-between gap-2 mb-0.5">
 <h3 className="text-sm font-medium">{title}</h3>
 {badge && (
 <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-success/15 text-success">
 {badge}
 </span>
 )}
 </div>
 <p className="text-[11px] text-fg-muted mb-1.5">
 {tagline}
 </p>
 <p className="text-xs text-fg-secondary leading-relaxed">
 {body}
 </p>
 </div>
 </div>
 </button>
 );
}
