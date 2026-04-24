"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "@/trpc/client";
import { showToast } from "./Toast";

type Source = { n: number; url: string; title: string; snippet: string };

type Props = {
  open: boolean;
  onClose: () => void;
  notebookId: string;
  initialQuery?: string;
};

type Stage =
  | "idle"
  | "plan"
  | "search"
  | "fetch"
  | "synthesize"
  | "done"
  | "error";

export function DeepResearchModal({
  open,
  onClose,
  notebookId,
  initialQuery,
}: Props) {
  const [query, setQuery] = useState(initialQuery ?? "");
  const [mode, setMode] = useState<"fast" | "deep">("deep");
  const [stage, setStage] = useState<Stage>("idle");
  const [stageMsg, setStageMsg] = useState("");
  const [plan, setPlan] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [report, setReport] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const utils = trpc.useUtils();
  const addFromUrl = trpc.source.addFromUrl.useMutation();
  const addFromText = trpc.source.addFromText.useMutation();

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery ?? "");
  }, [open, initialQuery]);

  const reset = useCallback(() => {
    setStage("idle");
    setStageMsg("");
    setPlan([]);
    setLogs([]);
    setSources([]);
    setReport("");
    setErrMsg(null);
  }, []);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    reset();
    setStage("plan");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebookId, query: q, mode }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { type: string; data: unknown };
            handleEvent(evt);
          } catch {}
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStage("error");
      setErrMsg(err instanceof Error ? err.message : String(err));
    }

    function handleEvent(evt: { type: string; data: unknown }) {
      switch (evt.type) {
        case "stage": {
          const d = evt.data as { stage: Stage; message: string };
          setStage(d.stage);
          setStageMsg(d.message);
          setLogs((l) => [...l, d.message]);
          break;
        }
        case "plan": {
          const d = evt.data as { subqueries: string[] };
          setPlan(d.subqueries);
          break;
        }
        case "search": {
          const d = evt.data as {
            subquery: string;
            results: { url: string; title: string }[];
          };
          setLogs((l) => [
            ...l,
            `  → ${d.results.length} result(s) for "${d.subquery}"`,
          ]);
          break;
        }
        case "fetch": {
          const d = evt.data as {
            url: string;
            title?: string;
            ok: boolean;
            error?: string;
          };
          setLogs((l) => [
            ...l,
            `  ${d.ok ? "✓" : "✗"} ${d.title ?? d.url}${
              !d.ok && d.error ? ` — ${d.error}` : ""
            }`,
          ]);
          break;
        }
        case "sources": {
          const d = evt.data as { sources: Source[] };
          setSources(d.sources);
          break;
        }
        case "report-delta": {
          const d = evt.data as string;
          setReport((r) => r + d);
          break;
        }
        case "done": {
          setStage("done");
          setStageMsg("Research complete");
          break;
        }
        case "error": {
          const d = evt.data as { message: string };
          setStage("error");
          setErrMsg(d.message);
          break;
        }
      }
    }
  }, [query, mode, notebookId, reset]);

  async function addAll() {
    const results = await Promise.allSettled(
      sources.map((s) =>
        addFromUrl.mutateAsync({ notebookId, url: s.url, title: s.title }),
      ),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    utils.source.list.invalidate({ notebookId });
    showToast(`Added ${succeeded} of ${sources.length} sources`);
    onClose();
  }

  async function addReportAsSource() {
    if (!report.trim()) return;
    try {
      await addFromText.mutateAsync({
        notebookId,
        title: `Research: ${query.slice(0, 50).trim()}`,
        text: report,
        kind: "text",
      });
      utils.source.list.invalidate({ notebookId });
      showToast("Report added as source");
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  async function addOne(s: Source) {
    try {
      await addFromUrl.mutateAsync({
        notebookId,
        url: s.url,
        title: s.title,
      });
      utils.source.list.invalidate({ notebookId });
      showToast(`Added ${s.title}`);
    } catch (err) {
      showToast((err as Error).message);
    }
  }

  if (!open) return null;
  const running = stage !== "idle" && stage !== "done" && stage !== "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={() => {
          abortRef.current?.abort();
          onClose();
        }}
      />
      <div className="relative w-full max-w-6xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
        {/* Header with gradient accent */}
        <div className="relative shrink-0">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <span className="material-symbols-outlined text-xl text-white">
                  science
                </span>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                  Deep Research
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  AI-powered web research and synthesis
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                onClose();
              }}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Search bar area */}
        <div className="px-6 py-4 border-y border-gray-100 dark:border-gray-800 shrink-0 bg-gray-50/50 dark:bg-gray-900/30">
          <div className="flex gap-3 items-center">
            <div className="flex-1 relative">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xl">
                search
              </span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={running}
                placeholder="What do you want to research?"
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-element-dark focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 text-sm shadow-sm transition-shadow"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !running) run();
                }}
              />
            </div>
            {/* Mode pill toggle */}
            <div className="flex p-1 bg-gray-200/70 dark:bg-gray-700 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setMode("fast")}
                disabled={running}
                className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${
                  mode === "fast"
                    ? "bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <span className="material-symbols-outlined text-xs align-middle mr-1">bolt</span>
                Fast
              </button>
              <button
                type="button"
                onClick={() => setMode("deep")}
                disabled={running}
                className={`px-4 py-2 rounded-md text-xs font-medium transition-all ${
                  mode === "deep"
                    ? "bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <span className="material-symbols-outlined text-xs align-middle mr-1">science</span>
                Deep
              </button>
            </div>
            <button
              type="button"
              onClick={() => (running ? abortRef.current?.abort() : run())}
              className={`px-6 py-3 rounded-xl text-sm font-semibold transition-all shadow-sm ${
                running
                  ? "bg-red-600 hover:bg-red-700 text-white shadow-red-500/25"
                  : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-indigo-500/25"
              }`}
            >
              {running ? (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                  Stop
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">play_arrow</span>
                  Research
                </span>
              )}
            </button>
          </div>

          {/* Status indicator */}
          {stage !== "idle" && (
            <div className="mt-3 flex items-center gap-2">
              {stage === "done" ? (
                <span className="w-2 h-2 rounded-full bg-green-500" />
              ) : stage === "error" ? (
                <span className="w-2 h-2 rounded-full bg-red-500" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              )}
              <span
                className={`text-xs font-medium ${
                  stage === "done"
                    ? "text-green-600 dark:text-green-400"
                    : stage === "error"
                      ? "text-red-600 dark:text-red-400"
                      : "text-indigo-600 dark:text-indigo-400"
                }`}
              >
                {stageMsg || stage}
              </span>
              {stage === "done" && (
                <span className="material-symbols-outlined text-sm text-green-500">check_circle</span>
              )}
              {stage === "error" && (
                <span className="material-symbols-outlined text-sm text-red-500">error</span>
              )}
            </div>
          )}
          {errMsg && (
            <div className="mt-2 text-xs text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-1.5 rounded-lg">
              {errMsg}
            </div>
          )}
        </div>

        {/* Three-column layout */}
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr_300px] gap-0 flex-1 min-h-0">
          {/* Left: Plan + Activity */}
          <div className="border-r border-gray-100 dark:border-gray-800 overflow-y-auto p-4 space-y-5 bg-gray-50/30 dark:bg-gray-900/20">
            {plan.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">checklist</span>
                  Research Plan
                </h3>
                <div className="space-y-2">
                  {plan.map((p, i) => (
                    <div
                      key={p}
                      className="flex gap-3 p-2.5 rounded-lg bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/50 shadow-sm"
                    >
                      <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                        {p}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {logs.length > 0 && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">terminal</span>
                  Activity
                </h3>
                <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400 space-y-1 bg-gray-100/70 dark:bg-gray-800/50 rounded-lg p-3 border border-gray-200/50 dark:border-gray-700/30">
                  {logs.map((l, i) => (
                    <div key={`${i}-${l.slice(0, 12)}`} className="leading-relaxed">
                      {l}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {running && (
              <div className="flex items-center gap-2 text-xs text-indigo-500 dark:text-indigo-400 pt-2">
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                <span>Working...</span>
              </div>
            )}
            {plan.length === 0 && logs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 opacity-50">
                <span className="material-symbols-outlined text-3xl text-gray-300 dark:text-gray-600 mb-2">
                  format_list_numbered
                </span>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Research plan will appear here
                </p>
              </div>
            )}
          </div>

          {/* Center: Report */}
          <div className="overflow-y-auto p-6">
            {report ? (
              <article className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
              </article>
            ) : running ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-lg w-3/4" />
                <div className="space-y-2">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-full" />
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-5/6" />
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-4/6" />
                </div>
                <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-2/3 mt-6" />
                <div className="space-y-2">
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-full" />
                  <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-5/6" />
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-3xl text-indigo-400 dark:text-indigo-500">
                    article
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  No report yet
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  Run a research query to generate an in-depth report
                </p>
              </div>
            )}
          </div>

          {/* Right: Sources */}
          <div className="border-l border-gray-100 dark:border-gray-800 overflow-y-auto p-4 bg-gray-50/30 dark:bg-gray-900/20">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">link</span>
                Sources ({sources.length})
              </h3>
              {sources.length > 0 && (
                <button
                  type="button"
                  onClick={addAll}
                  disabled={addFromUrl.isPending}
                  className="text-[11px] px-3 py-1 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-medium disabled:opacity-50 transition-all shadow-sm shadow-indigo-500/20"
                >
                  Add all
                </button>
              )}
            </div>
            <div className="space-y-2">
              {sources.map((s) => (
                <div
                  key={s.url}
                  className="p-3 rounded-xl border border-gray-200/70 dark:border-gray-700/50 bg-white dark:bg-gray-800/40 text-xs hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-mono text-indigo-400 dark:text-indigo-500 mt-0.5 font-bold">
                      [{s.n}]
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-2 text-gray-800 dark:text-gray-200 leading-relaxed">
                        {s.title}
                      </p>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 hover:underline truncate block mt-1"
                      >
                        {new URL(s.url).hostname}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => addOne(s)}
                      className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 font-medium transition-colors shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
              {sources.length === 0 && (
                <div className="flex flex-col items-center justify-center text-center py-12 opacity-50">
                  <span className="material-symbols-outlined text-3xl text-gray-300 dark:text-gray-600 mb-2">
                    language
                  </span>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Discovered sources appear here
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/30 flex items-center justify-between shrink-0">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {sources.length > 0
              ? `${sources.length} source${sources.length !== 1 ? "s" : ""} discovered`
              : "No sources yet"}
          </span>
          <div className="flex items-center gap-2">
            {report.trim() && stage === "done" && (
              <button
                type="button"
                onClick={addReportAsSource}
                disabled={addFromText.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white transition-all shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-sm">
                  add_circle
                </span>
                Add report as source
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                abortRef.current?.abort();
                onClose();
              }}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
