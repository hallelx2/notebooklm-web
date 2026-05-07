"use client";

import { useState } from "react";
import { trpc } from "../../trpc/client";

/**
 * Wizard step #5 — web search (optional).
 *
 * Surfaces every provider deep-research can use today:
 *   - Tavily   — free tier; the recommended starting point
 *   - Exa      — paid; high-quality neural + keyword fallback
 *   - SearxNG  — self-hosted; no key, just a base URL
 *
 * The step writes whichever credentials the user provides, then sets
 * the fallback chain order. Anything left blank is dropped from the
 * order so the runtime doesn't try (and fail) to call it. Order can be
 * re-arranged later under Settings → Web Search.
 */

type Field =
 | { kind: "api_key"; value: string }
 | { kind: "base_url"; value: string };

type ProviderId = "tavily" | "exa" | "searxng";

type ProviderSpec = {
 id: ProviderId;
 label: string;
 tagline: string;
 inputKind: "api_key" | "base_url";
 placeholder: string;
 signupUrl: string;
 signupBlurb: string;
 recommended?: boolean;
 selfHosted?: boolean;
};

const SPECS: ProviderSpec[] = [
 {
 id: "tavily",
 label: "Tavily",
 tagline: "1,000 searches / month free — recommended starting point",
 inputKind: "api_key",
 placeholder: "tvly-...",
 signupUrl: "https://app.tavily.com/sign-in",
 signupBlurb: "Sign up free →",
 recommended: true,
 },
 {
 id: "exa",
 label: "Exa",
 tagline: "Paid — neural + keyword hybrid, best fallback quality",
 inputKind: "api_key",
 placeholder: "exa-...",
 signupUrl: "https://dashboard.exa.ai/api-keys",
 signupBlurb: "Get a key →",
 },
 {
 id: "searxng",
 label: "SearxNG",
 tagline: "Self-hosted — no key, just point at your instance",
 inputKind: "base_url",
 placeholder: "https://searxng.your-host.example",
 signupUrl: "https://docs.searxng.org/admin/installation.html",
 signupBlurb: "Self-host docs →",
 selfHosted: true,
 },
];

type TestResult = null | { ok: boolean; msg?: string; latencyMs?: number };

export function WebSearchStep({
 onContinue,
 onSkip,
}: {
 onContinue: () => void;
 onSkip: () => void;
}) {
 const [fields, setFields] = useState<Record<ProviderId, Field>>({
 tavily: { kind: "api_key", value: "" },
 exa: { kind: "api_key", value: "" },
 searxng: { kind: "base_url", value: "" },
 });
 const [tests, setTests] = useState<Record<ProviderId, TestResult>>({
 tavily: null,
 exa: null,
 searxng: null,
 });
 const [error, setError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);

 const upsertSearch = trpc.searchConfig.upsertCredential.useMutation();
 const setEnabled = trpc.searchConfig.setEnabled.useMutation();
 const testSearch = trpc.searchConfig.testConnection.useMutation();
 const setOrder = trpc.searchConfig.setOrder.useMutation();
 const utils = trpc.useUtils();

 function setFieldValue(id: ProviderId, value: string) {
 setFields((prev) => ({
 ...prev,
 [id]: { ...prev[id], value } as Field,
 }));
 // Invalidate any prior test result for this provider — the value
 // changed, so the previous "Verified" badge is no longer accurate.
 setTests((prev) => ({ ...prev, [id]: null }));
 }

 async function testProvider(spec: ProviderSpec) {
 const f = fields[spec.id];
 if (!f.value.trim()) return;
 try {
 const result = await testSearch.mutateAsync({
 provider: spec.id,
 apiKey: spec.inputKind === "api_key" ? f.value.trim() : undefined,
 baseUrl: spec.inputKind === "base_url" ? f.value.trim() : undefined,
 });
 setTests((prev) => ({
 ...prev,
 [spec.id]: result.ok
 ? { ok: true, latencyMs: result.latencyMs }
 : { ok: false, msg: result.error },
 }));
 } catch (err) {
 setTests((prev) => ({
 ...prev,
 [spec.id]: {
 ok: false,
 msg: err instanceof Error ? err.message : String(err),
 },
 }));
 }
 }

 async function handleContinue() {
 setError(null);
 setSaving(true);
 try {
 // Save credentials + flip enabled for whichever providers the user
 // filled in. The order array tracks insertion order so the chain
 // is "what you typed first runs first".
 const order: ProviderId[] = [];
 for (const spec of SPECS) {
 const f = fields[spec.id];
 const filled = !!f.value.trim();
 if (!filled) continue;
 await upsertSearch.mutateAsync({
 provider: spec.id,
 apiKey:
 spec.inputKind === "api_key" ? f.value.trim() : undefined,
 baseUrl:
 spec.inputKind === "base_url" ? f.value.trim() : undefined,
 });
 await setEnabled.mutateAsync({ provider: spec.id, enabled: true });
 order.push(spec.id);
 }
 // Fall through any specs the user didn't fill in so they sit at
 // the end of the chain (disabled, but preserved if they later
 // add a key under Settings).
 for (const spec of SPECS) {
 if (!order.includes(spec.id)) order.push(spec.id);
 }
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

 const anyFilled = SPECS.some((s) => fields[s.id].value.trim().length > 0);

 return (
 <div className="space-y-6">
 <div>
 <p className="text-[11px] font-bold uppercase tracking-widest text-fg-muted mb-3">
 Step 5 · Optional
 </p>
 <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
 Wire up web search?
 </h1>
 <p className="text-fg-secondary text-sm leading-relaxed max-w-xl">
 Deep-research mode pulls fresh sources from the web to ground its
 answers. Configure as many providers as you want — the runtime
 calls them in the order you fill them in, falling back when one
 errors out.
 </p>
 </div>

 <div className="space-y-3">
 {SPECS.map((spec) => (
 <ProviderField
 key={spec.id}
 spec={spec}
 field={fields[spec.id]}
 onChange={(v) => setFieldValue(spec.id, v)}
 onTest={() => testProvider(spec)}
 testResult={tests[spec.id]}
 testing={testSearch.isPending}
 />
 ))}
 </div>

 <div className="rounded-card border border-border-subtle p-3 bg-accent-soft text-[11px] text-fg-secondary leading-relaxed">
 <strong className="text-fg">How fallback works:</strong>{" "}
 with multiple providers configured, the app calls them in the
 order shown above. If one errors out (rate-limited, quota burnt,
 network blip) it tries the next. Only when every provider in the
 chain fails does the whole search fail.
 </div>

 {error && <div className="text-[11px] text-danger">{error}</div>}

 <div className="flex items-center gap-3">
 <button
 type="button"
 onClick={handleContinue}
 disabled={saving}
 className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-fg text-fg-inverted font-medium text-sm hover:bg-fg-secondary transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
 >
 {saving
 ? "Saving..."
 : anyFilled
 ? "Save & continue"
 : "Continue without web search"}
 <span className="material-symbols-outlined text-base">
 arrow_forward
 </span>
 </button>
 <button
 type="button"
 onClick={onSkip}
 className="text-[11px] font-bold uppercase tracking-widest text-fg-muted hover:text-fg transition-colors"
 >
 Skip — I don't need web search
 </button>
 </div>
 </div>
 );
}

function ProviderField({
 spec,
 field,
 onChange,
 onTest,
 testResult,
 testing,
}: {
 spec: ProviderSpec;
 field: Field;
 onChange: (s: string) => void;
 onTest: () => void;
 testResult: TestResult;
 testing: boolean;
}) {
 return (
 <div className="rounded-card border border-border-subtle p-4 bg-accent-soft space-y-3">
 <div className="flex items-start justify-between gap-2">
 <div className="min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-sm font-medium">{spec.label}</h3>
 {spec.recommended && (
 <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-success/15 text-success">
 Recommended
 </span>
 )}
 {spec.selfHosted && (
 <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-fg-accent/15 text-fg-accent">
 Self-hosted
 </span>
 )}
 </div>
 <p className="text-[11px] text-fg-muted mt-0.5">
 {spec.tagline} ·{" "}
 <a
 href={spec.signupUrl}
 target="_blank"
 rel="noreferrer"
 className="underline hover:text-fg"
 >
 {spec.signupBlurb}
 </a>
 </p>
 </div>
 </div>

 <div className="flex gap-2">
 <input
 type={spec.inputKind === "api_key" ? "password" : "url"}
 value={field.value}
 onChange={(e) => onChange(e.target.value)}
 placeholder={spec.placeholder}
 className="flex-1 bg-surface border border-border-subtle px-3 py-2 text-sm rounded focus:border-fg-accent focus:outline-none font-mono"
 />
 <button
 type="button"
 onClick={onTest}
 disabled={!field.value.trim() || testing}
 className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 border border-border-subtle hover:border-fg text-fg-secondary hover:text-fg transition-colors disabled:opacity-50 disabled:cursor-not-allowed rounded-button"
 >
 Test
 </button>
 </div>

 {testResult?.ok && (
 <div className="text-[11px] text-success flex items-center gap-1.5">
 <span className="material-symbols-outlined text-[14px]">
 check_circle
 </span>
 Verified
 {testResult.latencyMs ? ` · ${testResult.latencyMs}ms` : ""} —
 saving on Continue.
 </div>
 )}
 {testResult && !testResult.ok && (
 <div className="text-[11px] text-danger">
 {testResult.msg ?? "Test failed."}
 </div>
 )}
 </div>
 );
}
