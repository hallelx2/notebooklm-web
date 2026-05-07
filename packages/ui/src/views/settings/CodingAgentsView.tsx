"use client";

import { Button, Pill, Spinner, Text, cn } from "@notebooklm/ui";
import { trpc } from "@notebooklm/ui/trpc/client";
import { useState } from "react";
import { SettingsSection } from "./SettingsSection";

type CodingAgent = {
  id: "claude-agent-sdk" | "codex-cli" | "copilot-cli";
  label: string;
  tagline: string;
  detectKey: "claude" | "codex" | "ghCopilot";
  installUrl: string;
  installCommand?: string;
  notes: string;
  /** True for runtimes that ship as a stub but aren't usable end-to-end yet. */
  stub?: boolean;
};

const AGENTS: CodingAgent[] = [
  {
    id: "claude-agent-sdk",
    label: "Claude Code",
    tagline: "Anthropic's coding agent — uses your existing CLI auth",
    detectKey: "claude",
    installUrl: "https://claude.ai/code",
    notes:
      "Full chat, research, and studio support via the Claude Agent SDK. Requires a logged-in `claude` CLI on this machine.",
  },
  {
    id: "codex-cli",
    label: "OpenAI Codex",
    tagline: "Codex CLI via @openai/codex-sdk — sandboxed chat",
    detectKey: "codex",
    installUrl: "https://github.com/openai/codex",
    installCommand: "npm i -g @openai/codex",
    notes:
      "Streams through the official Codex SDK (sandboxed, non-interactive). Studio + research fall back to the AI SDK.",
  },
  {
    id: "copilot-cli",
    label: "GitHub Copilot CLI",
    tagline: "`gh copilot` — coming in a later release",
    detectKey: "ghCopilot",
    installUrl: "https://docs.github.com/en/copilot/github-copilot-in-the-cli",
    installCommand: "gh extension install github/gh-copilot",
    notes:
      "Deferred. `gh copilot` exposes shell-suggestion only today; we'll wire chat once `gh copilot chat` stabilizes.",
    stub: true,
  },
];

export function CodingAgentsView() {
  const cfgQ = trpc.aiConfig.get.useQuery();
  const detectQ = trpc.runtimes.detectAvailable.useQuery(undefined, {
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const updateMut = trpc.aiConfig.update.useMutation();
  const utils = trpc.useUtils();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The active agent is whichever runtime sits at chat[0] when it
  // matches one of the coding-agent ids. The server stores this in
  // `preferences` (typed `unknown`); aiConfig.update accepts the
  // mirror-image `runtimePreferences` input. Anything that isn't a
  // coding-agent id (or empty) means chat routes through a regular
  // AI provider.
  const activeAgentId = (() => {
    const prefs = cfgQ.data?.preferences as
      | { chat?: unknown }
      | null
      | undefined;
    const raw = prefs?.chat;
    if (!Array.isArray(raw) || raw.length === 0) return null;
    const head = raw[0];
    return AGENTS.some((a) => a.id === head)
      ? (head as CodingAgent["id"])
      : null;
  })();

  async function activate(id: CodingAgent["id"]) {
    setError(null);
    setBusyId(id);
    try {
      // Same shape the onboarding step writes — keep "ai-sdk" as the
      // fallback so non-chat workloads (research, studio) still work
      // when the user has a regular AI provider configured.
      await updateMut.mutateAsync({
        runtimePreferences: { chat: [id, "ai-sdk"] },
      });
      await utils.aiConfig.get.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function clearAgent() {
    setError(null);
    setBusyId("__clear__");
    try {
      // Drop the coding-agent runtime — chat falls back to whatever
      // chatProvider/chatModel the user has saved.
      await updateMut.mutateAsync({
        runtimePreferences: { chat: ["ai-sdk"] },
      });
      await utils.aiConfig.get.invalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  const loading = cfgQ.isPending || detectQ.isPending;

  return (
    <SettingsSection
      tagline={
        activeAgentId
          ? `Settings · Coding agents · Active: ${
              AGENTS.find((a) => a.id === activeAgentId)?.label
            }`
          : "Settings · Coding agents"
      }
      title="Coding Agents"
      description="Route chat through a CLI you already use — Claude Code, OpenAI Codex, or `gh copilot`. No API key on our side; the agent handles its own auth."
    >
      {loading ? (
        <div className="py-20 text-center">
          <Spinner size={18} className="text-fg-muted" />
        </div>
      ) : (
        <div className="space-y-6">
          {activeAgentId ? (
            <ActiveBanner
              agent={AGENTS.find((a) => a.id === activeAgentId)!}
              onClear={clearAgent}
              busy={busyId === "__clear__"}
            />
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {AGENTS.map((a) => {
              const probe = detectQ.data?.[a.detectKey];
              const detected = !!probe?.ok;
              const usable = detected && !a.stub;
              const active = activeAgentId === a.id;
              return (
                <AgentCard
                  key={a.id}
                  agent={a}
                  detected={detected}
                  usable={usable}
                  active={active}
                  busy={busyId === a.id}
                  probeVersion={probe?.ok ? probe.version : undefined}
                  probeError={
                    probe && !probe.ok ? probe.error : undefined
                  }
                  onActivate={() => activate(a.id)}
                />
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => detectQ.refetch()}
              disabled={detectQ.isFetching}
              className="uppercase tracking-widest text-[10px] font-bold"
            >
              <span className="material-symbols-outlined text-[14px]">
                {detectQ.isFetching ? "sync" : "refresh"}
              </span>
              {detectQ.isFetching ? "Detecting" : "Re-detect"}
            </Button>
            {error ? (
              <Text variant="caption" tone="danger">
                {error}
              </Text>
            ) : null}
          </div>
        </div>
      )}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */

function ActiveBanner({
  agent,
  onClear,
  busy,
}: {
  agent: CodingAgent;
  onClear: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-4 rounded-card border border-fg-accent/40 bg-accent-soft">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-fg-accent mt-0.5">
          bolt
        </span>
        <div>
          <p className="text-sm font-medium text-fg">
            Routing chat through {agent.label}
          </p>
          <Text
            variant="body"
            tone="secondary"
            className="text-xs leading-relaxed mt-1"
          >
            Chat messages go through the local {agent.label} runtime. Studio
            outputs and deep research continue to use your saved AI provider.
          </Text>
        </div>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={onClear}
        disabled={busy}
        className="uppercase tracking-widest text-[10px] font-bold shrink-0"
      >
        {busy ? "Clearing" : "Use API providers"}
      </Button>
    </div>
  );
}

function AgentCard({
  agent,
  detected,
  usable,
  active,
  busy,
  probeVersion,
  probeError,
  onActivate,
}: {
  agent: CodingAgent;
  detected: boolean;
  usable: boolean;
  active: boolean;
  busy: boolean;
  probeVersion?: string;
  probeError?: string;
  onActivate: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-card border p-5 flex flex-col gap-3 transition-colors",
        active
          ? "border-fg-accent bg-accent-soft"
          : usable
            ? "border-success/30 bg-success/5"
            : "border-border-subtle bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-medium text-fg">{agent.label}</h3>
          <Text variant="body" tone="muted" className="text-xs mt-0.5">
            {agent.tagline}
          </Text>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {active ? (
            <Pill tone="accent">
              <span className="material-symbols-outlined text-[10px]">
                check
              </span>
              Active
            </Pill>
          ) : detected ? (
            <Pill tone="success">
              <span className="material-symbols-outlined text-[10px]">
                check_circle
              </span>
              Detected
            </Pill>
          ) : (
            <Pill tone="neutral">Not installed</Pill>
          )}
          {agent.stub ? <Pill tone="warning">Stub</Pill> : null}
        </div>
      </div>

      <Text variant="body" tone="secondary" className="text-xs leading-relaxed">
        {agent.notes}
      </Text>

      {probeVersion ? (
        <p className="text-[10px] font-mono text-success truncate">
          {probeVersion}
        </p>
      ) : null}

      {probeError ? (
        <div className="text-[11px] text-fg-muted space-y-1.5">
          <p className="leading-snug">{probeError}</p>
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={agent.installUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] underline hover:text-fg"
            >
              Install instructions →
            </a>
            {agent.installCommand ? (
              <code className="text-[10px] font-mono bg-elevated px-1.5 py-0.5 rounded border border-border-subtle">
                {agent.installCommand}
              </code>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-auto pt-2">
        {active ? (
          <Text variant="caption" tone="accent">
            Currently routing chat
          </Text>
        ) : (
          <Button
            variant={usable ? "primary" : "secondary"}
            size="sm"
            onClick={onActivate}
            disabled={!usable || busy}
            className="uppercase tracking-widest text-[10px] font-bold"
          >
            {busy
              ? "Activating"
              : !detected
                ? "Install first"
                : agent.stub
                  ? "Coming soon"
                  : "Use this"}
          </Button>
        )}
      </div>
    </div>
  );
}
