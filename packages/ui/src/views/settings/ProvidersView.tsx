"use client";

import type { AppRouter } from "@notebooklm/server";
import { trpc } from "@notebooklm/ui/trpc/client";
import type { inferRouterOutputs } from "@trpc/server";
import { useState } from "react";
import { SettingsSection } from "./SettingsSection";

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
    <div className="py-20 text-center text-[10px] font-bold uppercase tracking-widest text-fg-muted">
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
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-success">
          <span className="material-symbols-outlined text-[12px]">
            check_circle
          </span>
          Connected
        </span>
      );
    if (status === "invalid")
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-danger">
          <span className="material-symbols-outlined text-[12px]">error</span>
          Invalid
        </span>
      );
    return (
      <span className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
        Saved · untested
      </span>
    );
  })();

  return (
    <div
      className={`border bg-surface rounded-card transition-colors ${
        isOpen
          ? "border-fg col-span-full"
          : "border-border-subtle hover:border-border-strong"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 text-left"
      >
        <ProviderLogo src={provider.logo} alt={provider.label} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium text-fg truncate">{provider.label}</h3>
            {provider.selfHostedOnly ? (
              <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 border border-warning/40 text-warning flex-shrink-0">
                Self-hosted
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-fg-muted">
            {provider.authType === "none" ? (
              <span className="inline-flex items-center gap-1 text-success">
                <span className="material-symbols-outlined text-[12px]">
                  check_circle
                </span>
                Built-in · no setup
              </span>
            ) : saved ? (
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
      {isOpen && provider.authType === "none" ? (
        <BuiltInInfo provider={provider} onClose={onClose} />
      ) : isOpen ? (
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

/**
 * Card body shown when a `authType: "none"` provider is opened. There's
 * nothing to configure -- it just describes what the provider does and
 * why no key is needed.
 */
function BuiltInInfo({
  provider,
  onClose,
}: {
  provider: ProviderCatalog;
  onClose: () => void;
}) {
  const embedModelCount = provider.models.filter((m) =>
    m.capabilities.includes("embed"),
  ).length;
  return (
    <div className="p-5 border-t border-border-subtle space-y-3 bg-accent-soft text-sm text-fg-secondary">
      <p>
        Runs sentence-transformers ONNX models inside the app process — no API
        key, no GPU, no Docker, no Ollama install. Models download once on first
        use (~30 MB for the smallest) and are cached locally for offline use
        afterwards.
      </p>
      <p className="text-xs text-fg-muted">
        Pick one of the {embedModelCount} bundled models from the Models tab to
        start using {provider.label}. The default (BGE Small EN v1.5) works well
        on any laptop CPU.
      </p>
      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center w-11 h-11 border border-transparent text-fg-muted hover:text-fg transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
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
    <div className="p-5 border-t border-border-subtle space-y-4 bg-accent-soft">
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
            className="w-full h-11 bg-surface border border-border-subtle rounded-input px-4 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-accent transition-colors"
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
            className="w-full h-11 bg-surface border border-border-subtle rounded-input px-4 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-accent transition-colors"
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
            className="w-full h-11 bg-surface border border-border-subtle rounded-input px-4 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-fg-accent transition-colors"
          />
        </Field>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={handleSave}
          disabled={upsert.isPending}
          className="flex items-center justify-center gap-2 h-11 px-5 border border-success/70 bg-success/10 text-success text-[10px] font-bold uppercase tracking-widest hover:bg-success hover:text-success-fg transition-colors disabled:opacity-60 rounded-button"
        >
          <span className="material-symbols-outlined text-[14px]">save</span>
          {upsert.isPending ? "Saving" : "Save"}
        </button>
        <button
          type="button"
          onClick={handleTest}
          disabled={test.isPending || (!saved && !apiKey.trim())}
          className="flex items-center justify-center gap-2 h-11 px-5 border border-border-strong hover:border-fg text-fg-secondary text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 rounded-button"
        >
          <span className="material-symbols-outlined text-[14px]">bolt</span>
          {test.isPending ? "Testing" : "Test connection"}
        </button>
        {saved ? (
          <button
            type="button"
            onClick={handleDelete}
            disabled={remove.isPending}
            className="flex items-center justify-center gap-2 h-11 px-5 border border-danger/40 hover:border-danger text-danger text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-60 ml-auto rounded-button"
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
          className="flex items-center justify-center w-11 h-11 border border-transparent text-fg-muted hover:text-fg transition-colors"
          aria-label="Close"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>

      {testResult ? (
        <div
          className={`px-4 py-3 border text-[11px] font-mono ${
            testResult.kind === "ok"
              ? "border-success/40 bg-success/5 text-success"
              : "border-danger/40 bg-danger/5 text-danger"
          }`}
        >
          {testResult.kind === "ok"
            ? `✓ Connection OK · ${testResult.latencyMs}ms`
            : `✗ ${testResult.error}`}
        </div>
      ) : upsert.isError ? (
        <div className="px-4 py-3 border border-danger/40 bg-danger/5 text-danger text-[11px] font-mono">
          ✗ {upsert.error.message}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Provider logo tile — pinned to a white background regardless of pack /
 * tone. Many provider SVGs use `fill="currentColor"` (openai, ollama,
 * groq), which means they inherit the surrounding text color and vanish
 * on dark surfaces. Forcing a white tile + black text keeps every logo
 * legible without per-logo special-casing.
 */
function ProviderLogo({ src, alt }: { src: string; alt: string }) {
  return (
    <div
      className="w-10 h-10 flex items-center justify-center flex-shrink-0 p-1.5 rounded border border-border-subtle"
      style={{ background: "#ffffff", color: "#0d0d0d" }}
    >
      {/* biome-ignore lint/performance/noImgElement: SVG logo, next/image overhead unwarranted */}
      <img src={src} alt={alt} className="w-full h-full" />
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
        <span className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
          {label}
        </span>
        {docsUrl ? (
          <a
            href={docsUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-[10px] font-bold uppercase tracking-widest text-fg-accent hover:underline inline-flex items-center gap-1"
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
