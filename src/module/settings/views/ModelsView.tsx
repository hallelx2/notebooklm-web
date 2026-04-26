"use client";

import type { inferRouterOutputs } from "@trpc/server";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { AppRouter } from "@/server";
import { trpc } from "@/trpc/client";
import { SettingsSection } from "../components/SettingsSection";

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

  useEffect(() => {
    if (cfgQ.data) {
      setChatProvider(cfgQ.data.chatProvider ?? "");
      setChatModel(cfgQ.data.chatModel ?? "");
      setEmbedProvider(cfgQ.data.embeddingProvider ?? "");
      setEmbedModel(cfgQ.data.embeddingModel ?? "");
    }
  }, [cfgQ.data]);

  const catalog = catalogQ.data ?? [];
  const credentials = listQ.data ?? [];
  const configuredProviders = new Set(credentials.map((c) => c.provider));

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
    <SettingsSection
      tagline={`Settings · Models${ready ? " · Onboarded" : ""}`}
      title="Active Models"
      description="Choose the chat model and embedding model the app uses for everything — chat, deep research, retrieval, and ingestion."
    >
      {cfgQ.isLoading || catalogQ.isLoading || listQ.isLoading ? (
        <div className="py-20 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">
          Loading…
        </div>
      ) : (
        <div className="space-y-6">
          {noCredentials ? (
            <div className="border border-amber-500/40 bg-amber-500/5 px-5 py-4 text-sm text-amber-800 dark:text-amber-300">
              You haven't added any provider credentials yet.{" "}
              <Link
                href="/settings/providers"
                className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100"
              >
                Add one →
              </Link>
            </div>
          ) : null}

          <RoleBlock
            tag="Chat"
            title="Chat model"
            description="Used for chat answers, query expansion, reranking, autotitling, and every studio output."
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
                !!catalog.find((p) => p.id === chatProvider)
                  ?.supportsCustomModels
              }
            />
          </RoleBlock>

          <RoleBlock
            tag="Embedding"
            title="Embedding model"
            description="Used to vectorise source content for retrieval. Switching models triggers a one-time re-embed of your existing sources."
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
                !!catalog.find((p) => p.id === embedProvider)
                  ?.supportsCustomModels
              }
            />
            {embedDim ? (
              <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500 inline-flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[12px]">
                  memory
                </span>
                Vector dim · {embedDim}
              </p>
            ) : null}
            {currentEmbedDimChanged && cfgQ.data?.embeddingModel ? (
              <ReembedNotice />
            ) : null}
          </RoleBlock>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={updateMut.isPending || noCredentials}
              className="flex items-center justify-center gap-2 h-11 px-6 border border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white dark:hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[14px]">
                save
              </span>
              {updateMut.isPending ? "Saving" : "Save selections"}
            </button>
            {saveMessage ? (
              <span
                className={`text-[10px] font-bold uppercase tracking-widest ${
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
      )}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */

function RoleBlock({
  tag,
  title,
  description,
  children,
}: {
  tag: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-5">
      <div className="flex items-center gap-3 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-emerald-400">
          {tag}
        </span>
      </div>
      <h3 className="text-lg font-medium text-slate-900 dark:text-white tracking-tight">
        {title}
      </h3>
      <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400 font-light leading-relaxed mb-5">
        {description}
      </p>
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
        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2">
          Provider
        </span>
        <select
          value={providerValue}
          onChange={(e) => onProviderChange(e.target.value)}
          className="w-full h-11 bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-emerald-500 transition-colors"
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
        <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2">
          Model
        </span>
        {allowCustom ? (
          <input
            type="text"
            value={modelValue}
            onChange={(e) => onModelChange(e.target.value)}
            list={`models-${providerValue}`}
            placeholder="model-id"
            className="w-full h-11 bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-500 transition-colors"
          />
        ) : (
          <select
            value={modelValue}
            onChange={(e) => onModelChange(e.target.value)}
            disabled={!providerValue}
            className="w-full h-11 bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-4 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 dark:focus:border-emerald-500 transition-colors disabled:opacity-50"
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
    <div className="mt-4 border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
      <span className="material-symbols-outlined text-[14px] mt-px flex-shrink-0">
        sync
      </span>
      <span>
        You're switching embedding models. After saving, kick off a re-embed
        below so retrieval finds your existing sources. Old embeddings stay in
        storage for instant rollback.
      </span>
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
    <section className="border border-slate-200 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] p-5 mt-2">
      <div className="flex items-start gap-3 mb-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-emerald-400">
          Maintenance
        </span>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white tracking-tight">
            Re-embed all sources
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400 font-light leading-relaxed">
            Reprocess every existing source under your current embedding model.
            Old vectors stay in storage so you can switch back instantly.
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          disabled={running}
          className="flex items-center justify-center gap-2 h-11 px-5 border border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white dark:hover:text-black transition-colors disabled:opacity-60 self-start sm:self-auto whitespace-nowrap"
        >
          <span className="material-symbols-outlined text-[14px]">
            {running ? "sync" : "play_arrow"}
          </span>
          {running ? "Running" : "Start"}
        </button>
      </div>

      {events.length > 0 ? (
        <div className="border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#0a0a0a] p-3 max-h-60 overflow-y-auto space-y-1 text-[11px] font-mono">
          {events.map((entry) => (
            <ReembedLine key={entry.id} event={entry.ev} />
          ))}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-zinc-300">
          Done · {summary.succeeded}/{summary.total} succeeded
          {summary.failed > 0 ? ` · ${summary.failed} failed` : ""}
        </div>
      ) : null}
    </section>
  );
}

function ReembedLine({ event }: { event: ReembedEvent }) {
  switch (event.type) {
    case "source-start":
      return (
        <div className="text-slate-500 dark:text-zinc-500">↻ {event.title}</div>
      );
    case "source-done":
      return (
        <div className="text-emerald-700 dark:text-emerald-400">
          ✓ {event.sourceId.slice(0, 8)} · {event.chunkCount} chunks
        </div>
      );
    case "source-error":
      return (
        <div className="text-red-700 dark:text-red-400">
          ✗ {event.sourceId.slice(0, 8)} · {event.error}
        </div>
      );
    case "fatal":
      return (
        <div className="text-red-700 dark:text-red-400 font-bold">
          Fatal: {event.error}
        </div>
      );
    case "summary":
      return null;
  }
}
