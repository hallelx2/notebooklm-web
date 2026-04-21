"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
    for (const s of sources) {
      try {
        await addFromUrl.mutateAsync({
          notebookId,
          url: s.url,
          title: s.title,
        });
      } catch (err) {
        console.warn("addFromUrl failed", s.url, err);
      }
    }
    utils.source.list.invalidate({ notebookId });
    showToast(`Added ${sources.length} sources`);
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
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
        onClick={() => {
          abortRef.current?.abort();
          onClose();
        }}
      />
      <div className="relative w-full max-w-5xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-border-dark shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-indigo-600">
              science
            </span>
            <h2 className="text-xl font-medium text-gray-800 dark:text-gray-200">
              Deep Research
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 dark:border-border-dark shrink-0 flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={running}
              placeholder="What do you want to research?"
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-element-dark focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !running) run();
              }}
            />
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "fast" | "deep")}
              disabled={running}
              className="px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-element-dark text-sm"
            >
              <option value="deep">Deep</option>
              <option value="fast">Fast</option>
            </select>
            <button
              type="button"
              onClick={() => (running ? abortRef.current?.abort() : run())}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                running
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white"
              }`}
            >
              {running ? "Stop" : "Run research"}
            </button>
          </div>
          {stage !== "idle" && (
            <div className="text-xs text-gray-500 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">
                {stage === "done"
                  ? "check_circle"
                  : stage === "error"
                    ? "error"
                    : "autorenew"}
              </span>
              <span>{stageMsg || stage}</span>
            </div>
          )}
          {errMsg && (
            <div className="text-xs text-red-600">{errMsg}</div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr_280px] gap-0 flex-1 min-h-0">
          {/* Plan + log */}
          <div className="border-r border-gray-100 dark:border-border-dark overflow-y-auto p-4 space-y-4">
            {plan.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Plan
                </h3>
                <ol className="space-y-1 list-decimal list-inside text-sm">
                  {plan.map((p) => (
                    <li key={p} className="text-gray-700 dark:text-gray-300">
                      {p}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {logs.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                  Activity
                </h3>
                <div className="text-xs font-mono text-gray-600 dark:text-gray-400 space-y-0.5">
                  {logs.map((l, i) => (
                    <div key={`${i}-${l.slice(0, 12)}`}>{l}</div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Report */}
          <div className="overflow-y-auto p-6">
            {report ? (
              <article className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed">
                {report}
              </article>
            ) : (
              <div className="text-sm text-gray-500">
                {running
                  ? "Report will stream here as the agent writes it."
                  : "Run a research query to see the report here."}
              </div>
            )}
          </div>

          {/* Sources */}
          <div className="border-l border-gray-100 dark:border-border-dark overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sources ({sources.length})
              </h3>
              {sources.length > 0 && (
                <button
                  type="button"
                  onClick={addAll}
                  disabled={addFromUrl.isPending}
                  className="text-xs px-2.5 py-1 rounded-full bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
                >
                  Add all
                </button>
              )}
            </div>
            <div className="space-y-2">
              {sources.map((s) => (
                <div
                  key={s.url}
                  className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[10px] font-mono text-gray-400 mt-0.5">
                      [{s.n}]
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium line-clamp-2 text-gray-800 dark:text-gray-200">
                        {s.title}
                      </p>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline truncate block"
                      >
                        {new URL(s.url).hostname}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() => addOne(s)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
