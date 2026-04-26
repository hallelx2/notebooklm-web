"use client";

import type { inferRouterOutputs } from "@trpc/server";
import {
  Check,
  Cpu,
  Database,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AppRouter } from "@/server";
import { trpc } from "@/trpc/client";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ProviderCatalog = RouterOutputs["provider"]["catalog"][number];

export function ModelsView() {
  const cfgQ = trpc.aiConfig.get.useQuery();
  const catalogQ = trpc.provider.catalog.useQuery();
  const listQ = trpc.provider.list.useQuery();
  const updateMut = trpc.aiConfig.update.useMutation();
  const utils = trpc.useUtils();

  const [chatProvider, setChatProvider] = useState<string>("");
  const [chatModel, setChatModel] = useState<string>("");
  const [embedProvider, setEmbedProvider] = useState<string>("");
  const [embedModel, setEmbedModel] = useState<string>("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Hydrate local state from server config once it arrives.
  useEffect(() => {
    if (cfgQ.data) {
      setChatProvider(cfgQ.data.chatProvider ?? "");
      setChatModel(cfgQ.data.chatModel ?? "");
      setEmbedProvider(cfgQ.data.embeddingProvider ?? "");
      setEmbedModel(cfgQ.data.embeddingModel ?? "");
    }
  }, [cfgQ.data]);

  if (cfgQ.isLoading || catalogQ.isLoading || listQ.isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  const catalog = catalogQ.data ?? [];
  const credentials = listQ.data ?? [];
  const configuredProviders = new Set(credentials.map((c) => c.provider));

  // Filter to providers with saved credentials AND the right capability.
  const chatOptions = catalog.filter(
    (p) =>
      configuredProviders.has(p.id) &&
      (p.supportsCustomModels ||
        p.models.some((m) => m.capabilities.includes("chat"))),
  );
  const embedOptions = catalog.filter(
    (p) =>
      configuredProviders.has(p.id) &&
      (p.supportsCustomModels ||
        p.models.some((m) => m.capabilities.includes("embed"))),
  );

  const chatModels = (() => {
    const p = catalog.find((x) => x.id === chatProvider);
    return p?.models.filter((m) => m.capabilities.includes("chat")) ?? [];
  })();
  const embedModels = (() => {
    const p = catalog.find((x) => x.id === embedProvider);
    return p?.models.filter((m) => m.capabilities.includes("embed")) ?? [];
  })();

  const selectedEmbedModel = embedModels.find((m) => m.id === embedModel);
  const embedDim = selectedEmbedModel?.embedDim;

  async function handleSave() {
    setSaveMessage(null);
    try {
      await updateMut.mutateAsync({
        chatProvider: chatProvider || null,
        chatModel: chatModel || null,
        embeddingProvider: embedProvider || null,
        embeddingModel: embedModel || null,
        embeddingDim: embedDim ?? null,
      });
      utils.aiConfig.get.invalidate();
      setSaveMessage("Saved.");
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : String(err));
    }
  }

  const noCredentials = credentials.length === 0;
  const ready = !!cfgQ.data?.isOnboarded;
  const currentEmbedDimChanged =
    cfgQ.data?.embeddingModel !== embedModel ||
    cfgQ.data?.embeddingProvider !== embedProvider;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          Active models
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Pick which provider and model the app uses for chat and for
          embeddings. Both must be configured to use the app.
        </p>
      </div>

      {noCredentials ? (
        <div className="rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4 text-sm text-amber-800 dark:text-amber-200">
          You haven't added any provider credentials yet.{" "}
          <Link
            href="/settings/providers"
            className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100"
          >
            Add one now →
          </Link>
        </div>
      ) : null}

      {/* Chat ------------------------------------------------------ */}
      <RoleSection
        icon={<Sparkles className="w-5 h-5 text-indigo-500" />}
        title="Chat model"
        subtitle="Used for chat answers, query expansion, reranking, and auto-titling. Reuses the same model across all of those tasks."
      >
        <ProviderModelPicker
          providerOptions={chatOptions}
          modelOptions={chatModels}
          providerValue={chatProvider}
          modelValue={chatModel}
          onProviderChange={(v) => {
            setChatProvider(v);
            setChatModel("");
          }}
          onModelChange={setChatModel}
          allowCustom={
            !!catalog.find((p) => p.id === chatProvider)?.supportsCustomModels
          }
        />
      </RoleSection>

      {/* Embedding ------------------------------------------------- */}
      <RoleSection
        icon={<Database className="w-5 h-5 text-emerald-500" />}
        title="Embedding model"
        subtitle="Used to vectorize source content for retrieval. Switching models triggers a one-time re-embed of your existing sources."
      >
        <ProviderModelPicker
          providerOptions={embedOptions}
          modelOptions={embedModels}
          providerValue={embedProvider}
          modelValue={embedModel}
          onProviderChange={(v) => {
            setEmbedProvider(v);
            setEmbedModel("");
          }}
          onModelChange={setEmbedModel}
          allowCustom={
            !!catalog.find((p) => p.id === embedProvider)?.supportsCustomModels
          }
        />
        {embedDim ? (
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
            <Cpu className="w-3.5 h-3.5" />
            Vector dimension: <span className="font-mono">{embedDim}</span>
          </p>
        ) : null}
        {currentEmbedDimChanged && cfgQ.data?.embeddingModel ? (
          <ReembedNotice />
        ) : null}
      </RoleSection>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={updateMut.isPending || noCredentials}
          className="inline-flex items-center gap-1 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {updateMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Check className="w-4 h-4" />
          )}
          Save selections
        </button>
        {ready ? (
          <span className="text-xs text-gray-500 dark:text-gray-400 inline-flex items-center gap-1">
            <Check className="w-3.5 h-3.5 text-emerald-500" />
            Onboarded
          </span>
        ) : null}
        {saveMessage ? (
          <span
            className={`text-xs ${
              updateMut.isError
                ? "text-red-700 dark:text-red-400"
                : "text-emerald-700 dark:text-emerald-400"
            }`}
          >
            {saveMessage}
          </span>
        ) : null}
      </div>

      {ready ? <ReembedSection /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Re-embed all sources -- streamed NDJSON                            */
/* ------------------------------------------------------------------ */

type ReembedEvent =
  | {
      type: "source-start";
      sourceId: string;
      title: string;
      notebookId: string;
    }
  | { type: "source-done"; sourceId: string; chunkCount: number }
  | { type: "source-error"; sourceId: string; error: string }
  | { type: "summary"; total: number; succeeded: number; failed: number }
  | { type: "fatal"; error: string };

function ReembedSection() {
  const [running, setRunning] = useState(false);
  // Each entry has a stable monotonic id so it survives appends without
  // tripping the "no array index as key" rule.
  const [events, setEvents] = useState<{ id: number; ev: ReembedEvent }[]>([]);
  const nextId = useRef(0);

  async function start() {
    if (running) return;
    if (
      !confirm(
        "This will re-embed every source in every notebook with the current embedding model. It can take several minutes. Continue?",
      )
    )
      return;
    setRunning(true);
    setEvents([]);
    try {
      const res = await fetch("/api/reembed", { method: "POST" });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const ev = JSON.parse(line) as ReembedEvent;
            setEvents((prev) => [...prev, { id: nextId.current++, ev }]);
          } catch {
            // ignore malformed line
          }
        }
      }
    } catch (err) {
      setEvents((prev) => [
        ...prev,
        {
          id: nextId.current++,
          ev: {
            type: "fatal",
            error: err instanceof Error ? err.message : String(err),
          },
        },
      ]);
    } finally {
      setRunning(false);
    }
  }

  const summary = events.map((x) => x.ev).find((e) => e.type === "summary") as
    | (ReembedEvent & { type: "summary" })
    | undefined;

  return (
    <section className="rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-5 mt-6">
      <div className="flex items-start gap-3 mb-4">
        <RefreshCw className="w-5 h-5 text-indigo-500 mt-0.5" />
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            Re-embed all sources
          </h3>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            Reprocess every existing source under your current embedding model.
            Old vectors stay in storage so you can switch back instantly.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="inline-flex items-center gap-1 px-3 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg transition-colors"
        >
          {running ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {running ? "Running..." : "Start"}
        </button>
      </div>

      {events.length > 0 ? (
        <div className="mt-4 max-h-60 overflow-y-auto rounded-lg bg-element-light dark:bg-element-dark p-3 space-y-1 text-xs font-mono">
          {events.map((entry) => (
            <ReembedLine key={entry.id} event={entry.ev} />
          ))}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-3 text-xs text-gray-700 dark:text-gray-300">
          Done. {summary.succeeded} of {summary.total} succeeded
          {summary.failed > 0 ? ` (${summary.failed} failed)` : ""}.
        </div>
      ) : null}
    </section>
  );
}

function ReembedLine({ event }: { event: ReembedEvent }) {
  switch (event.type) {
    case "source-start":
      return (
        <div className="text-gray-500">
          <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />
          {event.title}
        </div>
      );
    case "source-done":
      return (
        <div className="text-emerald-700 dark:text-emerald-400">
          <Check className="inline w-3 h-3 mr-1" />
          {event.sourceId.slice(0, 8)}: {event.chunkCount} chunks
        </div>
      );
    case "source-error":
      return (
        <div className="text-red-700 dark:text-red-400">
          ✗ {event.sourceId.slice(0, 8)}: {event.error}
        </div>
      );
    case "fatal":
      return (
        <div className="text-red-700 dark:text-red-400 font-semibold">
          Fatal: {event.error}
        </div>
      );
    case "summary":
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function RoleSection({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex-shrink-0">{icon}</div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          <p className="mt-0.5 text-xs text-gray-600 dark:text-gray-400">
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ProviderModelPicker({
  providerOptions,
  modelOptions,
  providerValue,
  modelValue,
  onProviderChange,
  onModelChange,
  allowCustom,
}: {
  providerOptions: ProviderCatalog[];
  modelOptions: ProviderCatalog["models"];
  providerValue: string;
  modelValue: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
  allowCustom: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Provider
        </span>
        <select
          value={providerValue}
          onChange={(e) => onProviderChange(e.target.value)}
          className="w-full px-3 py-2 text-sm rounded-lg bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— Pick a provider —</option>
          {providerOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {/* biome-ignore lint/a11y/noLabelWithoutControl: input is a conditional child, biome can't statically see through it */}
      <label className="block">
        <span className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
          Model
        </span>
        {allowCustom ? (
          <input
            type="text"
            value={modelValue}
            onChange={(e) => onModelChange(e.target.value)}
            list={`models-${providerValue}`}
            placeholder="model-id (or pick from suggestions)"
            className="w-full px-3 py-2 text-sm rounded-lg bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        ) : (
          <select
            value={modelValue}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={!providerValue}
            className="w-full px-3 py-2 text-sm rounded-lg bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            <option value="">— Pick a model —</option>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.deprecated ? " (deprecated)" : ""}
              </option>
            ))}
          </select>
        )}
        {allowCustom && providerValue ? (
          <datalist id={`models-${providerValue}`}>
            {modelOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </datalist>
        ) : null}
      </label>
    </div>
  );
}

function ReembedNotice() {
  return (
    <div className="mt-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2">
      <RefreshCw className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>
        You're switching embedding models. After saving, your existing sources
        will need to be re-embedded so retrieval finds them. Old embeddings stay
        in storage for instant rollback.
      </span>
    </div>
  );
}
