"use client";

import { useCallback, useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import { showToast } from "./Toast";

type Tab = "research" | "files" | "link" | "drive";

type PendingFile = {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

type Source = { n: number; url: string; title: string; snippet: string };

type Props = {
  open: boolean;
  onClose: () => void;
  notebookId: string;
  defaultTab?: Tab;
};

export function UploadModal({
  open,
  onClose,
  notebookId,
  defaultTab = "research",
}: Props) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [link, setLink] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  // Research state
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"fast" | "deep">("deep");
  const [running, setRunning] = useState(false);
  const [plan, setPlan] = useState<string[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [report, setReport] = useState("");
  const [stageMsg, setStageMsg] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const addedAllRef = useRef(false);

  const addLink = trpc.source.addLink.useMutation({
    onSuccess: () => {
      utils.source.list.invalidate({ notebookId });
      showToast("Link added — parsing");
      setLink("");
    },
    onError: (e) => showToast(e.message),
  });
  const addFromUrl = trpc.source.addFromUrl.useMutation();

  const resetResearch = () => {
    setPlan([]);
    setLogs([]);
    setSources([]);
    setReport("");
    setStageMsg("");
    setErrMsg(null);
    addedAllRef.current = false;
  };

  const runResearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    resetResearch();
    setRunning(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/deep-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notebookId, query: q, mode }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastSources: Source[] = [];

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: { type: string; data: unknown };
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          switch (evt.type) {
            case "stage": {
              const d = evt.data as { stage: string; message: string };
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
                results: { url: string }[];
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
              };
              setLogs((l) => [
                ...l,
                `  ${d.ok ? "✓" : "✗"} ${d.title ?? d.url}`,
              ]);
              break;
            }
            case "sources": {
              const d = evt.data as { sources: Source[] };
              setSources(d.sources);
              lastSources = d.sources;
              // Auto-add on success
              if (!addedAllRef.current && d.sources.length > 0) {
                addedAllRef.current = true;
                (async () => {
                  for (const s of d.sources) {
                    try {
                      await addFromUrl.mutateAsync({
                        notebookId,
                        url: s.url,
                        title: s.title,
                      });
                    } catch {}
                  }
                  utils.source.list.invalidate({ notebookId });
                  showToast(`${d.sources.length} sources added to notebook`);
                })();
              }
              break;
            }
            case "report-delta": {
              setReport((r) => r + (evt.data as string));
              break;
            }
            case "done": {
              setStageMsg("Research complete");
              break;
            }
            case "error": {
              const d = evt.data as { message: string };
              setErrMsg(d.message);
              break;
            }
          }
        }
      }
      if (lastSources.length === 0 && !errMsg) {
        setErrMsg("No sources returned.");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setErrMsg(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setRunning(false);
    }
  }, [query, mode, notebookId, addFromUrl, utils, errMsg]);

  async function uploadOne(p: PendingFile, idx: number) {
    setPending((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, status: "uploading" } : x)),
    );
    const fd = new FormData();
    fd.append("notebookId", notebookId);
    fd.append("file", p.file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      setPending((prev) =>
        prev.map((x, i) => (i === idx ? { ...x, status: "done" } : x)),
      );
      utils.source.list.invalidate({ notebookId });
    } catch (err) {
      setPending((prev) =>
        prev.map((x, i) =>
          i === idx
            ? {
                ...x,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
              }
            : x,
        ),
      );
    }
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const added: PendingFile[] = files.map((f) => ({
      file: f,
      status: "queued",
    }));
    setPending((prev) => {
      const next = [...prev, ...added];
      added.forEach((_, i) => uploadOne(added[i], prev.length + i));
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (!files.length) return;
    const added: PendingFile[] = files.map((f) => ({
      file: f,
      status: "queued",
    }));
    setPending((prev) => {
      const next = [...prev, ...added];
      added.forEach((_, i) => uploadOne(added[i], prev.length + i));
      return next;
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={() => {
          abortRef.current?.abort();
          onClose();
        }}
      />
      <div className="relative w-full max-w-3xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-border-dark shrink-0">
          <h2 className="text-xl font-medium text-gray-800 dark:text-gray-200">
            Add & Manage Sources
          </h2>
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
        <div className="flex px-6 pt-2 border-b border-gray-100 dark:border-border-dark shrink-0 gap-8 overflow-x-auto">
          {(
            [
              { id: "research", icon: "science", label: "Research" },
              { id: "files", icon: "upload_file", label: "Upload Files" },
              { id: "link", icon: "link", label: "Link" },
              { id: "drive", icon: "add_to_drive", label: "Google Drive" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`pb-3 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "research" && (
          <div className="overflow-y-auto p-6 flex-1 space-y-5">
            <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400">
                  science
                </span>
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  Let the agent find your sources
                </h3>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-4 leading-relaxed">
                Describe what you want to research. The agent plans
                sub-questions, searches the web, reads the top pages, writes a
                report, and adds everything it used as sources.
              </p>

              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-element-dark focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/30 transition-colors">
                  <span className="material-symbols-outlined text-gray-400 ml-3">
                    search
                  </span>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    disabled={running}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !running) runResearch();
                    }}
                    placeholder="What do you want to research?"
                    className="flex-1 bg-transparent py-3 pr-4 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none"
                  />
                </div>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-gray-100 dark:bg-element-dark">
                  <button
                    type="button"
                    onClick={() => setMode("fast")}
                    disabled={running}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      mode === "fast"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      bolt
                    </span>
                    Fast
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("deep")}
                    disabled={running}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      mode === "deep"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-200"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      science
                    </span>
                    Deep
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    running ? abortRef.current?.abort() : runResearch()
                  }
                  disabled={!running && !query.trim()}
                  className={`px-5 py-3 rounded-xl text-sm font-medium transition-colors disabled:opacity-50 ${
                    running
                      ? "bg-red-600 hover:bg-red-700 text-white"
                      : "bg-indigo-600 hover:bg-indigo-700 text-white"
                  }`}
                >
                  {running ? "Stop" : "Research"}
                </button>
              </div>

              {stageMsg && (
                <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">
                    {running ? "autorenew" : "check_circle"}
                  </span>
                  {stageMsg}
                </div>
              )}
              {errMsg && (
                <div className="mt-3 text-xs text-red-600">{errMsg}</div>
              )}
            </div>

            {(plan.length > 0 || logs.length > 0) && (
              <div className="grid md:grid-cols-[220px_1fr] gap-4">
                <div className="rounded-xl border border-gray-200 dark:border-border-dark p-4 space-y-3">
                  {plan.length > 0 && (
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                        Plan
                      </h4>
                      <ol className="space-y-1 list-decimal list-inside text-xs">
                        {plan.map((p) => (
                          <li
                            key={p}
                            className="text-gray-700 dark:text-gray-300"
                          >
                            {p}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                  {logs.length > 0 && (
                    <div>
                      <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                        Activity
                      </h4>
                      <div className="text-[10px] font-mono text-gray-600 dark:text-gray-400 space-y-0.5 max-h-40 overflow-y-auto">
                        {logs.map((l, i) => (
                          <div key={`${i}-${l.slice(0, 10)}`}>{l}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-border-dark p-4">
                  <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                    Report (auto-added to notebook)
                  </h4>
                  <article className="text-xs leading-relaxed whitespace-pre-wrap text-gray-700 dark:text-gray-300 max-h-56 overflow-y-auto">
                    {report || (
                      <span className="text-gray-400">
                        {running
                          ? "Writing…"
                          : "Run a query to see the report here."}
                      </span>
                    )}
                  </article>
                </div>
              </div>
            )}

            {sources.length > 0 && (
              <div>
                <h4 className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
                  Discovered sources ({sources.length}) — automatically added
                </h4>
                <div className="grid sm:grid-cols-2 gap-2">
                  {sources.map((s) => (
                    <a
                      key={s.url}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-xs hover:border-blue-400"
                    >
                      <div className="flex items-start gap-2">
                        <span className="font-mono text-[9px] text-gray-400 mt-0.5">
                          [{s.n}]
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium line-clamp-2 text-gray-800 dark:text-gray-200">
                            {s.title}
                          </p>
                          <p className="text-blue-600 hover:underline truncate">
                            {new URL(s.url).hostname}
                          </p>
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "files" && (
          <div className="overflow-y-auto p-6 flex-1">
            {pending.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  Uploading & Embedding
                </h3>
                <div className="space-y-2">
                  {pending.map((p, i) => (
                    <div
                      key={`${p.file.name}-${i}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-element-light dark:bg-element-dark"
                    >
                      <span className="material-symbols-outlined text-blue-500">
                        description
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p.file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(p.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 capitalize">
                        {p.status === "error"
                          ? `error: ${p.error?.slice(0, 40)}`
                          : p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-10 flex flex-col items-center justify-center text-center bg-gray-50 dark:bg-element-dark/50 hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:border-blue-300 transition-all cursor-pointer group"
            >
              <div className="w-14 h-14 rounded-full bg-white dark:bg-surface-dark shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400">
                  cloud_upload
                </span>
              </div>
              <p className="text-base font-medium text-gray-700 dark:text-gray-200 mb-1">
                Drag & drop or{" "}
                <span className="text-blue-600 hover:underline">
                  choose files
                </span>{" "}
                to upload
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                PDF, TXT, MD (Max 200MB)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                onChange={onFiles}
              />
            </div>
          </div>
        )}

        {tab === "link" && (
          <div className="p-6 flex-1">
            <label
              htmlFor="linkInput"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block"
            >
              Enter URL
            </label>
            <input
              id="linkInput"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-element-dark text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 mb-6"
              placeholder="https://example.com/article"
            />
            <button
              type="button"
              disabled={!link || addLink.isPending}
              onClick={() => addLink.mutate({ notebookId, url: link })}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {addLink.isPending ? "Adding..." : "Add Link"}
            </button>
          </div>
        )}

        {tab === "drive" && (
          <div className="p-6 flex-1">
            <div className="text-center py-10">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-green-600 dark:text-green-400">
                  add_to_drive
                </span>
              </div>
              <p className="text-base font-medium text-gray-700 dark:text-gray-200 mb-2">
                Connect Google Drive
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Import files directly from your Google Drive
              </p>
              <button
                type="button"
                onClick={() => showToast("Google Drive integration coming soon!")}
                className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full font-medium transition-colors"
              >
                Connect Drive
              </button>
            </div>
          </div>
        )}

        <div className="p-4 bg-gray-50 dark:bg-surface-dark border-t border-gray-100 dark:border-border-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="material-symbols-outlined text-lg">
              check_circle
            </span>
            <span>
              {tab === "files"
                ? `${pending.filter((p) => p.status === "done").length} of ${pending.length} uploaded`
                : tab === "research"
                  ? `${sources.length} sources from research`
                  : "Ready"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 rounded-full transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
