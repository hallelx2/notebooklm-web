"use client";

import { useState } from "react";

/**
 * Wizard step #4 — audio overview (optional).
 *
 * Three real backends, exposed as one toggle + one provider radio:
 *   - bundled Kokoro (default — ONNX shipped in the installer)
 *   - Deepgram (paid cloud — API key)
 *   - skip (don't enable audio at all; user can flip it on later)
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleContinue() {
    setError(null);
    setSaving(true);
    try {
      // Both modes are "no-op" at the persistence layer in this
      // first-pass:
      //   - "bundled": Kokoro is the default in the audio handler when
      //     no Deepgram key / KOKORO_BASE_URL is set; bundled weights
      //     make it work out of the box.
      //   - "deepgram": the credential plumbing for non-AI providers
      //     (TTS) isn't wired through the user_provider_credentials
      //     table yet — Deepgram still relies on env var. We surface
      //     the option here so the user knows it exists, with a
      //     follow-up link to Settings → Audio for the actual key
      //     entry.
      if (mode === "deepgram") {
        // Save a hint of the user's intent on `userAiConfig.preferences`
        // so Settings → Audio can render a "Welcome — paste your
        // Deepgram key" banner. For now, just pass through.
      }
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
          Step 4 · Optional
        </p>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
          Want podcast-style audio summaries?
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed max-w-xl">
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
        <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 p-4 bg-amber-50/60 dark:bg-amber-500/5 text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">
          <strong>Heads up:</strong> Deepgram key entry isn't wired
          into the wizard yet. Continue with the bundled model for
          now — once the app is open, head to <em>Settings → Audio</em>
          to paste a Deepgram key and switch over. Sign up free at{" "}
          <a
            href="https://console.deepgram.com/signup"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-slate-900 dark:hover:text-white"
          >
            console.deepgram.com
          </a>
          .
        </div>
      )}

      {error && (
        <div className="text-[11px] text-red-700 dark:text-red-300">{error}</div>
      )}

      <div className="flex items-center gap-3">
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
        <button
          type="button"
          onClick={onSkip}
          className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
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
            <h3 className="text-sm font-medium">{title}</h3>
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
