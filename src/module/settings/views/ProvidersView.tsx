"use client";

import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import type { AppRouter } from "@/server";
import { trpc } from "@/trpc/client";
import { SettingsSection } from "../components/SettingsSection";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProviderCatalog = RouterOutputs["provider"]["catalog"][number];
type CredentialRow = RouterOutputs["provider"]["list"][number];

export function ProvidersView() {
  const catalogQ = trpc.provider.catalog.useQuery();
  const listQ = trpc.provider.list.useQuery();
  const [editing, setEditing] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const catalog = catalogQ.data ?? [];
  const credentials = listQ.data ?? [];
  const credentialByProvider = new Map(credentials.map((c) => [c.provider, c]));

  return (
    <SettingsSection
      tagline={`Settings · Providers · ${catalog.length} available`}
      title="AI Providers"
      description="Bring your own keys. Saved keys are encrypted at rest with the deployer's ENCRYPTION_KEY and never leave the server in plaintext."
    >
      {catalogQ.isLoading || listQ.isLoading ? (
        <Loading />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {catalog.map((p) => {
            const saved = credentialByProvider.get(p.id);
            const isOpen = editing === p.id;
            return (
              <ProviderCard
                key={p.id}
                provider={p}
                saved={saved}
                isOpen={isOpen}
                onToggle={() => setEditing(isOpen ? null : p.id)}
                onClose={() => setEditing(null)}
                onChange={() => {
                  utils.provider.list.invalidate();
                  utils.aiConfig.get.invalidate();
                }}
              />
            );
          })}
        </div>
      )}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */

function Loading() {
  return (
    <div className="py-20 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">
      Loading…
    </div>
  );
}

function ProviderCard({
  provider,
  saved,
  isOpen,
  onToggle,
  onClose,
  onChange,
}: {
  provider: ProviderCatalog;
  saved: CredentialRow | undefined;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChange: () => void;
}) {
  const status = saved?.validationStatus;
  const statusBadge = (() => {
    if (!saved) return null;
    if (status === "ok")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          <span className="material-symbols-outlined text-[12px]">
            check_circle
          </span>
          Connected
        </span>
      );
    if (status === "invalid")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-red-700 dark:text-red-400">
          <span className="material-symbols-outlined text-[12px]">error</span>
          Invalid
        </span>
      );
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">
        Saved · untested
      </span>
    );
  })();

  return (
    <div
      className={`border bg-white dark:bg-[#0a0a0a] transition-colors ${
        isOpen
          ? "border-slate-900 dark:border-white col-span-full"
          : "border-slate-200 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/30"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 text-left"
      >
        <div className="w-10 h-10 bg-white border border-slate-200 dark:border-white/10 flex items-center justify-center flex-shrink-0 p-1.5">
          {/* biome-ignore lint/performance/noImgElement: SVG logo, next/image overhead unwarranted */}
          <img src={provider.logo} alt="" className="w-full h-full" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-slate-900 dark:text-white truncate">
              {provider.label}
            </h3>
            {provider.selfHostedOnly ? (
              <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 border border-amber-500/40 text-amber-700 dark:text-amber-400 flex-shrink-0">
                Self-hosted
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">
            {saved ? (
              statusBadge
            ) : (
              <span className="inline-flex items-center gap-1">
                <span className="material-symbols-outlined text-[12px]">
                  add
                </span>
                Add credentials
              </span>
            )}
          </div>
        </div>
      </button>
      {isOpen ? (
        <CredentialForm
          provider={provider}
          saved={saved}
          onClose={onClose}
          onChange={onChange}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function CredentialForm({
  provider,
  saved,
  onClose,
  onChange,
}: {
  provider: ProviderCatalog;
  saved: CredentialRow | undefined;
  onClose: () => void;
  onChange: () => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(
    saved?.baseUrl ?? provider.defaultBaseUrl ?? "",
  );
  const [organization, setOrganization] = useState(saved?.organization ?? "");
  const [testResult, setTestResult] = useState<
    { kind: "ok"; latencyMs: number } | { kind: "error"; error: string } | null
  >(null);

  const upsert = trpc.provider.upsert.useMutation();
  const remove = trpc.provider.delete.useMutation();
  const test = trpc.provider.test.useMutation();

  const showApiKeyInput = provider.authType !== "base_url_only";
  const showBaseUrlInput =
    provider.baseUrlRequired || provider.authType !== "api_key";
  const showOrg = provider.id === "openai";

  const testKind: "chat" | "embed" = provider.models.some((m) =>
    m.capabilities.includes("chat"),
  )
    ? "chat"
    : "embed";
  const testModel = provider.models.find((m) =>
    m.capabilities.includes(testKind),
  );
  const testDim = testModel?.embedDim;

  async function handleSave() {
    setTestResult(null);
    await upsert.mutateAsync({
      provider: provider.id,
      label: "default",
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
      organization: organization.trim() || undefined,
    });
    setApiKey("");
    onChange();
  }

  async function handleTest() {
    setTestResult(null);
    if (!testModel) {
      setTestResult({
        kind: "error",
        error: "No model registered for this provider yet.",
      });
      return;
    }
    try {
      const result = await test.mutateAsync({
        credentialId: saved?.id,
        provider: !saved ? provider.id : undefined,
        apiKey: !saved ? apiKey.trim() || undefined : undefined,
        baseUrl: !saved ? baseUrl.trim() || undefined : undefined,
        kind: testKind,
        model: testModel.id,
        dim: testDim,
      });
      if (result.ok) {
        setTestResult({ kind: "ok", latencyMs: result.latencyMs });
      } else {
        setTestResult({ kind: "error", error: result.error });
      }
      onChange();
    } catch (err) {
      setTestResult({
        kind: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function handleDelete() {
    if (!saved) return;
    if (!confirm(`Remove your ${provider.label} credential?`)) return;
    await remove.mutateAsync({ id: saved.id });
    onChange();
    onClose();
  }

  return (
    <div className="p-5 border-t border-slate-200 dark:border-white/10 space-y-4 bg-slate-50/50 dark:bg-white/[0.02]">
      {showApiKeyInput ? (
        <Field
          label="API Key"
          docsUrl={provider.apiKeyDocsUrl ?? undefined}
          docsLabel="Get a key"
        >
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              saved?.hasKey
                ? "•••••••••••••••• — enter a new key to replace"
                : "Paste your API key"
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full h-11 bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-500 transition-colors"
          />
        </Field>
      ) : null}

      {showBaseUrlInput ? (
        <Field
          label={`Base URL${provider.baseUrlRequired ? " — required" : " — optional"}`}
        >
          <input
            type="url"
            placeholder={
              provider.baseUrlPlaceholder ??
              provider.defaultBaseUrl ??
              "https://..."
            }
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full h-11 bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-500 transition-colors"
          />
        </Field>
      ) : null}

      {showOrg ? (
        <Field label="Organization — optional">
          <input
            type="text"
            placeholder="org-..."
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className="w-full h-11 bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-500 transition-colors"
          />
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={upsert.isPending}
          className="flex items-center justify-center gap-2 h-11 px-5 border border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white dark:hover:text-black transition-colors disabled:opacity-60"
        >
          <span className="material-symbols-outlined text-[14px]">save</span>
          {upsert.isPending ? "Saving" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={test.isPending || (!saved && !apiKey.trim())}
          className="flex items-center justify-center gap-2 h-11 px-5 border border-slate-300 hover:border-slate-900 dark:border-white/20 dark:hover:border-white text-slate-700 dark:text-zinc-300 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50"
        >
          <span className="material-symbols-outlined text-[14px]">bolt</span>
          {test.isPending ? "Testing" : "Test connection"}
        </button>
        {saved ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={remove.isPending}
            className="flex items-center justify-center gap-2 h-11 px-5 border border-red-500/40 hover:border-red-500 text-red-700 dark:text-red-400 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-60 ml-auto"
          >
            <span className="material-symbols-outlined text-[14px]">
              delete
            </span>
            Remove
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-11 h-11 border border-transparent text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {testResult ? (
        <div
          className={`px-4 py-3 border text-[11px] font-mono ${
            testResult.kind === "ok"
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300"
              : "border-red-500/40 bg-red-500/5 text-red-800 dark:text-red-300"
          }`}
        >
          {testResult.kind === "ok"
            ? `✓ Connection OK · ${testResult.latencyMs}ms`
            : `✗ ${testResult.error}`}
        </div>
      ) : upsert.isError ? (
        <div className="px-4 py-3 border border-red-500/40 bg-red-500/5 text-red-800 dark:text-red-300 text-[11px] font-mono">
          ✗ {upsert.error.message}
        </div>
      ) : null}
    </div>
  );
}

function Field({
  label,
  docsUrl,
  docsLabel,
  children,
}: {
  label: string;
  docsUrl?: string;
  docsLabel?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input is passed via children, biome can't see through it
    <label className="block">
      <span className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
          {label}
        </span>
        {docsUrl ? (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
          >
            {docsLabel ?? "Docs"}
            <span className="material-symbols-outlined text-[12px]">
              open_in_new
            </span>
          </a>
        ) : null}
      </span>
      {children}
    </label>
  );
}
