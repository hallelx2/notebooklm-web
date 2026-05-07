"use client";

import { Spinner, Text, cn } from "@notebooklm/ui";
import { Link, useRouter } from "@notebooklm/ui/contexts";
import { trpc } from "@notebooklm/ui/trpc/client";

/**
 * Nav for `/settings/*`. Two variants exported:
 *   - `SettingsNav`     — horizontal scrollable strip, used on mobile
 *   - `SettingsSidebar` — vertical left rail, used on lg+
 *
 * Both consume the same status snapshot via `useSettingsStatus()` so
 * we don't double-up tRPC observers when both render at the same DOM
 * node and CSS hides the wrong one. Doubling those observers triggers
 * extra render churn that has been linked to the React 19 / TanStack
 * Router unmount bug where a route subtree fails to detach and the
 * new route stacks on top — see ThemeProvider.tsx's prelude for the
 * underlying mechanism.
 */

type Section = {
  href: string;
  label: string;
  icon: string;
  /**
   * Status read out of the tRPC summary. `undefined` means we have no
   * opinion (the section doesn't really have a "configured" state, e.g.
   * Profile / Appearance).
   */
  statusKey?: "providers" | "models" | "agents" | "search";
};

type SectionGroup = {
  label: string;
  sections: Section[];
};

const GROUPS: SectionGroup[] = [
  {
    label: "You",
    sections: [
      { href: "/settings/profile", label: "Profile", icon: "person" },
    ],
  },
  {
    label: "AI",
    sections: [
      {
        href: "/settings/providers",
        label: "Providers",
        icon: "key",
        statusKey: "providers",
      },
      {
        href: "/settings/models",
        label: "Models",
        icon: "smart_toy",
        statusKey: "models",
      },
      {
        href: "/settings/coding-agents",
        label: "Coding Agents",
        icon: "terminal",
        statusKey: "agents",
      },
    ],
  },
  {
    label: "Capabilities",
    sections: [
      {
        href: "/settings/web-search",
        label: "Web Search",
        icon: "travel_explore",
        statusKey: "search",
      },
    ],
  },
  {
    label: "Workspace",
    sections: [
      {
        href: "/settings/appearance",
        label: "Appearance",
        icon: "palette",
      },
    ],
  },
];

/**
 * Single source of truth for the per-section status dots. Both
 * `SettingsNav` and `SettingsSidebar` call this so React Query
 * deduplicates the observers — one set of observers per query, not
 * two.
 */
function useSettingsStatus() {
  const aiCfgQ = trpc.aiConfig.get.useQuery();
  const providerListQ = trpc.provider.list.useQuery();
  const searchListQ = trpc.searchConfig.list.useQuery();
  return {
    status: computeStatus({
      aiCfg: aiCfgQ.data,
      providers: providerListQ.data,
      search: searchListQ.data,
    }),
    loading:
      aiCfgQ.isPending || providerListQ.isPending || searchListQ.isPending,
  };
}

export function SettingsNav() {
  const { pathname } = useRouter();
  const { status } = useSettingsStatus();

  return (
    <nav
      aria-label="Settings sections"
      className={cn(
        // Mobile: horizontal scrollable strip pinned under chrome
        "lg:hidden sticky top-0 z-30 bg-canvas/90 backdrop-blur-md border-b border-border-subtle",
        "px-4 sm:px-6 py-3",
      )}
    >
      <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar">
        {GROUPS.flatMap((g) => g.sections).map((s) => {
          const active =
            pathname === s.href || pathname.startsWith(`${s.href}/`);
          const dot = s.statusKey ? status[s.statusKey] : undefined;
          return (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "shrink-0 inline-flex items-center gap-2 h-9 px-3 rounded-pill border transition-colors",
                "text-[10px] font-bold uppercase tracking-widest",
                active
                  ? "border-fg bg-fg text-fg-inverted"
                  : "border-border-subtle hover:border-border-strong text-fg-secondary",
              )}
            >
              <span className="material-symbols-outlined text-[14px]">
                {s.icon}
              </span>
              {s.label}
              {dot ? <StatusDot tone={dot} /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Desktop sidebar — rendered as a sibling to the content area in the
 * settings layouts. Hidden on mobile (the horizontal nav above takes
 * over there).
 */
export function SettingsSidebar() {
  const { pathname } = useRouter();
  const { status, loading } = useSettingsStatus();

  return (
    <aside
      aria-label="Settings sections"
      className="hidden lg:block w-[260px] shrink-0 border-r border-border-subtle"
    >
      <div className="sticky top-0 max-h-screen overflow-y-auto py-10 pr-6 pl-2">
        <div className="flex items-center gap-2 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <Text variant="caption" tone="muted">
            Settings
          </Text>
          {loading ? (
            <Spinner size={12} className="text-fg-muted ml-auto" />
          ) : null}
        </div>

        <div className="space-y-6">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-3 mb-1.5">
                <Text variant="caption" tone="muted">
                  {group.label}
                </Text>
              </div>
              <ul className="space-y-0.5">
                {group.sections.map((s) => {
                  const active =
                    pathname === s.href || pathname.startsWith(`${s.href}/`);
                  const dot = s.statusKey ? status[s.statusKey] : undefined;
                  return (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        className={cn(
                          "flex items-center gap-3 h-9 px-3 rounded-card transition-colors text-sm",
                          active
                            ? "bg-accent-soft text-fg font-medium"
                            : "text-fg-secondary hover:bg-accent-soft hover:text-fg",
                        )}
                      >
                        <span
                          className={cn(
                            "material-symbols-outlined text-[18px]",
                            active ? "text-fg-accent" : "text-fg-muted",
                          )}
                        >
                          {s.icon}
                        </span>
                        <span className="flex-1 truncate">{s.label}</span>
                        {dot ? <StatusDot tone={dot} /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */

type DotTone = "ok" | "warn" | "off" | "active";

function StatusDot({ tone }: { tone: DotTone }) {
  const cls = {
    ok: "bg-success",
    warn: "bg-warning",
    off: "bg-fg-muted/40",
    active: "bg-fg-accent",
  }[tone];
  const label = {
    ok: "Configured",
    warn: "Needs attention",
    off: "Not configured",
    active: "Active",
  }[tone];
  return (
    <span
      title={label}
      aria-label={label}
      className={cn("inline-block h-1.5 w-1.5 rounded-full shrink-0", cls)}
    />
  );
}

type Status = {
  providers: DotTone;
  models: DotTone;
  agents: DotTone;
  search: DotTone;
};

function computeStatus(args: {
  aiCfg:
    | {
        chatProvider: string | null;
        chatModel: string | null;
        embeddingProvider: string | null;
        embeddingModel: string | null;
        preferences?: unknown;
      }
    | undefined;
  providers: Array<unknown> | undefined;
  search:
    | {
        providers: Array<{
          enabled: boolean;
          configured: { hasKey?: boolean; baseUrl?: string | null } | null;
          envFallback: { apiKey?: boolean; baseUrl?: boolean };
        }>;
      }
    | undefined;
}): Status {
  const providersConfigured = (args.providers?.length ?? 0) > 0;
  const chatOk = !!args.aiCfg?.chatProvider && !!args.aiCfg?.chatModel;
  const embedOk =
    !!args.aiCfg?.embeddingProvider && !!args.aiCfg?.embeddingModel;
  const prefs = args.aiCfg?.preferences as { chat?: unknown } | null;
  const chatRuntime = Array.isArray(prefs?.chat) ? prefs.chat[0] : undefined;
  const codingAgentActive =
    typeof chatRuntime === "string" &&
    (chatRuntime === "claude-agent-sdk" || chatRuntime === "codex-cli");

  const searchAny =
    args.search?.providers?.some(
      (p) =>
        p.enabled &&
        ((p.configured?.hasKey ?? false) ||
          p.envFallback.apiKey ||
          !!p.configured?.baseUrl ||
          p.envFallback.baseUrl),
    ) ?? false;

  return {
    providers: providersConfigured ? "ok" : "off",
    models: chatOk && embedOk ? "ok" : chatOk || embedOk ? "warn" : "off",
    agents: codingAgentActive ? "active" : "off",
    search: searchAny ? "ok" : "off",
  };
}
