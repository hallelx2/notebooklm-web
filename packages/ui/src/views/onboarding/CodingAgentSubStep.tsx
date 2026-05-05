"use client";

import { useState } from "react";
import { trpc } from "../../trpc/client";

/**
 * Coding-agent branch of the wizard's AI-provider step.
 *
 * Three sub-options, each gated on detection of the underlying CLI:
 *   - Claude Code (`claude` binary)         → claude-agent-sdk runtime
 *   - OpenAI Codex (`codex` binary)         → codex-cli runtime
 *   - GitHub Copilot (`gh copilot` ext.)    → copilot-cli runtime (stub)
 *
 * Picking one writes `userAiConfig.preferences.chat = [<id>, "ai-sdk"]`
 * (the runtime first, ai-sdk as a fallback for tasks the runtime
 * doesn't support yet) and skips the API-key step entirely. Onboarding
 * accepts this as "chat configured" — see aiConfig.update's
 * `chatConfigured` check.
 *
 * Cards are always visible; not-detected ones render disabled with an
 * install hint so the user can fix and retry without leaving the
 * wizard. A "Recheck" button retriggers the detection query.
 */

type CodingAgent = {
  id: "claude-agent-sdk" | "codex-cli" | "copilot-cli";
  label: string;
  tagline: string;
  /** Where the user gets it. */
  installUrl: string;
  installCommand?: string;
  /** What this agent can do for chat in our app. */
  notes: string;
  /** Maps to which detection field on detectAvailable's payload. */
  detectKey: "claude" | "codex" | "ghCopilot";
};

const AGENTS: CodingAgent[] = [
  {
    id: "claude-agent-sdk",
    label: "Claude Code",
    tagline: "Anthropic's coding agent — uses your existing CLI auth",
    installUrl: "https://claude.ai/code",
    notes:
      "Full chat, research, and studio support via the Claude Agent SDK. Requires a logged-in `claude` CLI on this machine.",
    detectKey: "claude",
  },
  {
    id: "codex-cli",
    label: "OpenAI Codex",
    tagline: "Codex CLI via @openai/codex-sdk — sandboxed chat",
    installUrl: "https://github.com/openai/codex",
    installCommand: "npm i -g @openai/codex",
    notes:
      "Streams through the official Codex SDK (which spawns `codex` and reads JSONL events). Locked to read-only sandbox + non-interactive approval, so Codex behaves like a chat assistant rather than running commands on your machine. Studio + research fall back to the AI SDK.",
    detectKey: "codex",
  },
  {
    id: "copilot-cli",
    label: "GitHub Copilot CLI",
    tagline: "`gh copilot` — coming in a later release",
    installUrl: "https://docs.github.com/en/copilot/github-copilot-in-the-cli",
    installCommand: "gh extension install github/gh-copilot",
    notes:
      "Deferred. `gh copilot` today exposes shell-suggestion / explanation only — not freeform chat. We'll wire real chat once `gh copilot chat` stabilizes.",
    detectKey: "ghCopilot",
  },
];

export function CodingAgentSubStep({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  const [selected, setSelected] = useState<CodingAgent["id"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const detectQ = trpc.runtimes.detectAvailable.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const setAiConfig = trpc.aiConfig.update.useMutation();
  const utils = trpc.useUtils();

  const agent = AGENTS.find((a) => a.id === selected) ?? null;
  const detection = detectQ.data;

  const isDetected = (key: CodingAgent["detectKey"]): boolean => {
    if (!detection) return false;
    return !!detection[key]?.ok;
  };

  async function handleSave() {
    if (!agent) return;
    setError(null);
    setSaving(true);
    try {
      // Save the chat preference. We deliberately keep "ai-sdk" as
      // the secondary so studio/research/rerank (which the coding
      // agents don't fully support yet) fall back automatically when
      // the user later configures a chat provider in Settings.
      await setAiConfig.mutateAsync({
        runtimePreferences: {
          chat: [agent.id, "ai-sdk"],
        },
      });
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
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors mb-3 inline-flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-[14px]">
            arrow_back
          </span>
          Choose a different path
        </button>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
          Pick your coding agent
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed max-w-xl">
          We'll route chat through the tool you already use — no API
          key on our side. Cards greyed out below aren't installed on
          this machine yet; click the install link to fix and hit
          Recheck.
        </p>
      </div>

      {detectQ.isPending && (
        <div className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-2">
          <span className="material-symbols-outlined text-[14px] animate-spin">
            progress_activity
          </span>
          Detecting installed coding agents...
        </div>
      )}

      <div className="space-y-3">
        {AGENTS.map((a) => {
          const detected = isDetected(a.detectKey);
          const stub = a.id === "copilot-cli";
          const enabled = detected && !stub;
          const active = selected === a.id;
          // Pull the actual probe result for nicer UX (version string,
          // error message).
          const probe = detection?.[a.detectKey];
          return (
            <button
              key={a.id}
              type="button"
              disabled={!enabled}
              onClick={() => {
                if (!enabled) return;
                setSelected(a.id);
                setError(null);
              }}
              className={`w-full text-left rounded-xl border p-4 transition-all ${
                !enabled
                  ? "border-slate-200 dark:border-white/10 opacity-50 cursor-not-allowed bg-slate-50/40 dark:bg-white/[0.02]"
                  : active
                    ? "border-indigo-500 dark:border-indigo-400 bg-indigo-50/60 dark:bg-indigo-500/10 ring-2 ring-indigo-500/20"
                    : detected
                      ? "border-emerald-300 dark:border-emerald-500/30 hover:border-emerald-500 dark:hover:border-emerald-400 bg-emerald-50/30 dark:bg-emerald-500/5"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 bg-slate-50/40 dark:bg-white/[0.02]"
              }`}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-medium">{a.label}</h3>
                    {detected ? (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[10px]">
                          check
                        </span>
                        Detected
                      </span>
                    ) : (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-zinc-400">
                        Not installed
                      </span>
                    )}
                    {stub && (
                      <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300">
                        Stub
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                    {a.tagline}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-snug">
                {a.notes}
              </p>
              {probe?.ok && probe.version && (
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 mt-2 font-mono truncate">
                  {probe.version}
                </p>
              )}
              {probe && !probe.ok && (
                <div className="mt-2 text-[11px] text-slate-500 dark:text-zinc-500">
                  {probe.error}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <a
                      href={a.installUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[10px] underline hover:text-slate-900 dark:hover:text-white"
                    >
                      Install instructions →
                    </a>
                    {a.installCommand && (
                      <code className="text-[10px] font-mono bg-slate-100 dark:bg-white/[0.04] px-1.5 py-0.5 rounded">
                        {a.installCommand}
                      </code>
                    )}
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!agent || saving}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black font-medium text-sm hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? "Saving..." : agent ? `Use ${agent.label}` : "Pick one above"}
          {!saving && agent && (
            <span className="material-symbols-outlined text-base">
              arrow_forward
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => detectQ.refetch()}
          className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
        >
          Recheck
        </button>
      </div>

      {error && (
        <div className="text-[11px] text-red-700 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
