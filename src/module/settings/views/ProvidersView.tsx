"use client";

import type { inferRouterOutputs } from "@trpc/server";
import {
  AlertCircle,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import type { AppRouter } from "@/server";
import { trpc } from "@/trpc/client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProviderCatalog = RouterOutputs["provider"]["catalog"][number];
type CredentialRow = RouterOutputs["provider"]["list"][number];

export function ProvidersView() {
  const catalogQ = trpc.provider.catalog.useQuery();
  const listQ = trpc.provider.list.useQuery();
  const [editing, setEditing] = useState<string | null>(null);

  const utils = trpc.useUtils();

  if (catalogQ.isLoading || listQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const catalog = catalogQ.data ?? [];
  const credentials = listQ.data ?? [];
  const credentialByProvider = new Map(credentials.map((c) => [c.provider, c]));

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Providers
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Connect your own API keys. Keys are encrypted at rest with the
          deployer's{" "}
          <code className="px-1 rounded bg-element-light dark:bg-element-dark text-xs">
            ENCRYPTION_KEY
          </code>{" "}
          and never leave the server in plaintext.
        </p>
      </div>

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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Provider card -- expands to a form when clicked                    */
/* ------------------------------------------------------------------ */

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
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="w-3 h-3" />
          Connected
        </span>
      );
    if (status === "invalid")
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-700 dark:text-red-400">
          <AlertCircle className="w-3 h-3" />
          Invalid
        </span>
      );
    return (
      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
        Saved · not tested
      </span>
    );
  })();

  return (
    <div
      className={`rounded-xl border bg-surface-light dark:bg-surface-dark transition-all ${
        isOpen
          ? "border-indigo-400 dark:border-indigo-500 shadow-lg col-span-full"
          : "border-border-light dark:border-border-dark hover:border-indigo-300 dark:hover:border-indigo-600"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-white ring-1 ring-border-light dark:ring-border-dark flex items-center justify-center flex-shrink-0 p-1.5">
          {/* biome-ignore lint/performance/noImgElement: SVG logos don't benefit from next/image optimization */}
          <img src={provider.logo} alt="" className="w-full h-full" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {provider.label}
            </h3>
            {provider.selfHostedOnly ? (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 flex-shrink-0">
                Self-hosted
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
            {saved ? (
              statusBadge
            ) : (
              <span className="inline-flex items-center gap-1">
                <Plus className="w-3 h-3" />
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
/*  Credential form                                                     */
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

  // Pick a sensible default model for the test:
  // first chat-capable model, or first embed-capable for embed-only providers.
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
        error:
          "No model available to test against -- add a model in the registry.",
      });
      return;
    }
    try {
      const result = await test.mutateAsync({
        credentialId: saved?.id,
        // For draft credentials (key entered but not saved):
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
    <div className="p-4 border-t border-border-light dark:border-border-dark space-y-3">
      {showApiKeyInput ? (
        <div>
          <label
            htmlFor={`apiKey-${provider.id}`}
            className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            API Key
            {provider.apiKeyDocsUrl ? (
              <a
                href={provider.apiKeyDocsUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-2 text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 text-[11px]"
              >
                Get a key <ExternalLink className="w-3 h-3" />
              </a>
            ) : null}
          </label>
          <input
            id={`apiKey-${provider.id}`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              saved?.hasKey
                ? "•••••••••••••••• (saved -- enter a new key to replace)"
                : "Paste your API key"
            }
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      ) : null}

      {showBaseUrlInput ? (
        <div>
          <label
            htmlFor={`baseUrl-${provider.id}`}
            className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Base URL{provider.baseUrlRequired ? " (required)" : " (optional)"}
          </label>
          <input
            id={`baseUrl-${provider.id}`}
            type="url"
            placeholder={
              provider.baseUrlPlaceholder ??
              provider.defaultBaseUrl ??
              "https://..."
            }
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      ) : null}

      {showOrg ? (
        <div>
          <label
            htmlFor={`org-${provider.id}`}
            className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Organization (optional)
          </label>
          <input
            id={`org-${provider.id}`}
            type="text"
            placeholder="org-..."
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={upsert.isPending}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {upsert.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : null}
          Save
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={test.isPending || (!saved && !apiKey.trim())}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 border border-border-light dark:border-border-dark hover:bg-element-light dark:hover:bg-element-dark disabled:opacity-50 rounded-lg transition-colors"
        >
          {test.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          Test connection
        </button>
        {saved ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={remove.isPending}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 rounded-lg transition-colors ml-auto"
          >
            <Trash2 className="w-4 h-4" />
            Remove
          </button>
        ) : null}
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center px-2 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {testResult ? (
        <div
          className={`text-xs px-3 py-2 rounded-lg ${
            testResult.kind === "ok"
              ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300"
              : "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300"
          }`}
        >
          {testResult.kind === "ok" ? (
            <>
              <Check className="inline w-3.5 h-3.5 mr-1" />
              Connection OK ({testResult.latencyMs}ms)
            </>
          ) : (
            <>
              <AlertCircle className="inline w-3.5 h-3.5 mr-1" />
              {testResult.error}
            </>
          )}
        </div>
      ) : upsert.isError ? (
        <div className="text-xs px-3 py-2 rounded-lg bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          {upsert.error.message}
        </div>
      ) : null}
    </div>
  );
}
