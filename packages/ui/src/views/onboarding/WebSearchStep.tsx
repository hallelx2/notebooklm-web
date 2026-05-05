"use client";

import { useState } from "react";
import { trpc } from "../../trpc/client";

/**
 * Wizard step #5 — web search (optional).
 *
 * The default chain is Tavily → Exa: Tavily fires first (free tier
 * covers most users), Exa is the paid fallback for when Tavily quota
 * is exhausted or its results are insufficient. The user can save
 * either, both, or neither — and re-order later in Settings.
 *
 * SearxNG is intentionally NOT surfaced in the wizard. Users running
 * their own SearxNG can flip it on under Settings → Web Search.
 */

export function WebSearchStep({
  onContinue,
  onSkip,
}: {
  onContinue: () => void;
  onSkip: () => void;
}) {
  const [tavilyKey, setTavilyKey] = useState("");
  const [exaKey, setExaKey] = useState("");
  const [tavilyTested, setTavilyTested] = useState<null | {
    ok: boolean;
    msg?: string;
  }>(null);
  const [exaTested, setExaTested] = useState<null | {
    ok: boolean;
    msg?: string;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const upsertSearch = trpc.searchConfig.upsertCredential.useMutation();
  const testSearch = trpc.searchConfig.testConnection.useMutation();
  const setOrder = trpc.searchConfig.setOrder.useMutation();
  const utils = trpc.useUtils();

  async function testProvider(provider: "tavily" | "exa", key: string) {
    if (!key.trim()) return;
    try {
      const result = await testSearch.mutateAsync({
        provider,
        apiKey: key.trim(),
      });
      const setter = provider === "tavily" ? setTavilyTested : setExaTested;
      if (result.ok) {
        setter({ ok: true });
      } else {
        setter({ ok: false, msg: result.error });
      }
    } catch (err) {
      const setter = provider === "tavily" ? setTavilyTested : setExaTested;
      setter({ ok: false, msg: err instanceof Error ? err.message : String(err) });
    }
  }

  async function handleContinue() {
    setError(null);
    setSaving(true);
    try {
      // Save whichever keys were entered. The Settings UI lets the
      // user remove / change either later.
      const order: ("tavily" | "exa" | "searxng")[] = [];
      if (tavilyKey.trim()) {
        await upsertSearch.mutateAsync({
          provider: "tavily",
          apiKey: tavilyKey.trim(),
        });
        order.push("tavily");
      }
      if (exaKey.trim()) {
        await upsertSearch.mutateAsync({
          provider: "exa",
          apiKey: exaKey.trim(),
        });
        order.push("exa");
      }
      // SearxNG stays last in the chain even though the wizard doesn't
      // configure it — keeps a clean upgrade path for users who later
      // turn on a self-hosted instance under Settings.
      order.push("searxng");
      // setOrder is idempotent — fine to call even when both are empty
      // (the user just gets the default chain order).
      if (order.length > 1) {
        await setOrder.mutateAsync({ order });
      }
      await utils.searchConfig.list.invalidate();
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
          Step 5 · Optional
        </p>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
          Want fresh results from the web?
        </h1>
        <p className="text-slate-600 dark:text-zinc-400 text-sm leading-relaxed max-w-xl">
          Deep-research mode pulls live sources to ground its answers.
          Tavily's free tier covers most usage; add Exa if you want a
          paid fallback for when Tavily runs out of quota.
        </p>
      </div>

      <ProviderField
        provider="tavily"
        label="Tavily"
        tagline="1000 searches / month free"
        signupUrl="https://app.tavily.com/sign-in"
        signupBlurb="Sign up free →"
        keyValue={tavilyKey}
        onKeyChange={setTavilyKey}
        onTest={() => testProvider("tavily", tavilyKey)}
        testResult={tavilyTested}
        testing={testSearch.isPending}
        recommended
      />

      <ProviderField
        provider="exa"
        label="Exa"
        tagline="Paid — neural + keyword hybrid search"
        signupUrl="https://dashboard.exa.ai/api-keys"
        signupBlurb="Get a key →"
        keyValue={exaKey}
        onKeyChange={setExaKey}
        onTest={() => testProvider("exa", exaKey)}
        testResult={exaTested}
        testing={testSearch.isPending}
      />

      <div className="rounded-xl border border-slate-200 dark:border-white/10 p-3 bg-slate-50/40 dark:bg-white/[0.02] text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed">
        <strong className="text-slate-900 dark:text-white">
          How fallback works:
        </strong>{" "}
        with both keys saved, the app calls Tavily first. If Tavily
        errors out (rate-limited, quota burnt, network blip), it tries
        Exa next. Only when every provider in the chain fails does the
        whole search fail.
      </div>

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
          Skip — I don't need web search
        </button>
      </div>
    </div>
  );
}

function ProviderField({
  provider,
  label,
  tagline,
  signupUrl,
  signupBlurb,
  keyValue,
  onKeyChange,
  onTest,
  testResult,
  testing,
  recommended,
}: {
  provider: "tavily" | "exa";
  label: string;
  tagline: string;
  signupUrl: string;
  signupBlurb: string;
  keyValue: string;
  onKeyChange: (s: string) => void;
  onTest: () => void;
  testResult: null | { ok: boolean; msg?: string };
  testing: boolean;
  recommended?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-white/10 p-4 bg-slate-50/40 dark:bg-white/[0.02] space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium">{label}</h3>
            {recommended && (
              <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                Recommended
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
            {tagline} ·{" "}
            <a
              href={signupUrl}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-slate-900 dark:hover:text-white"
            >
              {signupBlurb}
            </a>
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <input
          type="password"
          value={keyValue}
          onChange={(e) => onKeyChange(e.target.value)}
          placeholder={`Paste your ${label} key (or skip)`}
          className="flex-1 bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-3 py-2 text-sm rounded focus:border-slate-900 dark:focus:border-white focus:outline-none"
        />
        <button
          type="button"
          onClick={onTest}
          disabled={!keyValue.trim() || testing}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 border border-slate-300 dark:border-white/20 hover:border-slate-900 dark:hover:border-white text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded"
        >
          Test
        </button>
      </div>

      {testResult?.ok && (
        <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[14px]">
            check_circle
          </span>
          Verified — saving on Continue.
        </div>
      )}
      {testResult && !testResult.ok && (
        <div className="text-[11px] text-red-700 dark:text-red-300">
          {testResult.msg ?? "Test failed."}
        </div>
      )}
    </div>
  );
}
