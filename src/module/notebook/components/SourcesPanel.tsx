"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { showToast } from "./Toast";

type Props = {
  notebookId: string;
  onOpenUpload: () => void;
  onOpenDeepResearch: (query?: string) => void;
  selectedSourceIds: string[];
  setSelectedSourceIds: (ids: string[]) => void;
};

export function SourcesPanel({
  notebookId,
  onOpenUpload,
  onOpenDeepResearch,
  selectedSourceIds,
  setSelectedSourceIds,
}: Props) {
  const [searchMode, setSearchMode] = useState<"local" | "web">("local");
  const [searchType, setSearchType] = useState<"fast" | "deep">("fast");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    {
      url: string;
      title: string;
      snippet: string;
    }[]
  >([]);

  const utils = trpc.useUtils();
  const list = trpc.source.list.useQuery(
    { notebookId },
    { refetchInterval: 2500 },
  );
  const addFromUrl = trpc.source.addFromUrl.useMutation({
    onSuccess: () => {
      utils.source.list.invalidate({ notebookId });
      showToast("Source added");
    },
    onError: (e) => showToast(e.message),
  });
  const del = trpc.source.delete.useMutation({
    onSuccess: () => utils.source.list.invalidate({ notebookId }),
  });
  const retry = trpc.source.retry.useMutation({
    onSuccess: () => {
      utils.source.list.invalidate({ notebookId });
      showToast("Retrying source...");
    },
    onError: (e) => showToast(e.message),
  });
  const searchWeb = trpc.search.web.useMutation({
    onSuccess: (r) => setResults(r),
    onError: (e) => showToast(e.message),
  });

  function runSearch() {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    if (searchMode !== "web") return;
    if (searchType === "deep") {
      onOpenDeepResearch(q);
      return;
    }
    searchWeb.mutate({ query: q, mode: "fast", limit: 8 });
  }

  async function addAll() {
    const settled = await Promise.allSettled(
      results.map((r) =>
        addFromUrl.mutateAsync({ notebookId, url: r.url, title: r.title }),
      ),
    );
    const succeeded = settled.filter((r) => r.status === "fulfilled").length;
    utils.source.list.invalidate({ notebookId });
    showToast(`Added ${succeeded} of ${results.length} sources`);
  }

  function toggleSelected(id: string) {
    if (selectedSourceIds.includes(id)) {
      setSelectedSourceIds(selectedSourceIds.filter((x) => x !== id));
    } else {
      setSelectedSourceIds([...selectedSourceIds, id]);
    }
  }

  const localFiltered = (list.data ?? []).filter((s) =>
    query ? s.title.toLowerCase().includes(query.toLowerCase()) : true,
  );

  return (
    <>
      <div className="p-4 flex items-center justify-between">
        <h2 className="font-medium text-gray-800 dark:text-gray-200">
          Sources
        </h2>
        <button
          type="button"
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
        >
          <span className="material-symbols-outlined">left_panel_close</span>
        </button>
      </div>
      <div className="px-4 flex flex-col gap-4 overflow-y-auto flex-1 pb-4">
        <button
          type="button"
          onClick={onOpenUpload}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 dark:hover:bg-element-dark transition-colors text-blue-600 dark:text-blue-300"
        >
          <span className="material-symbols-outlined">add</span>
          Add sources
        </button>

        <div
          className="p-3 rounded-xl bg-gradient-to-br from-indigo-900/10 to-purple-900/10 dark:from-indigo-900/40 dark:to-purple-900/40 border border-indigo-200 dark:border-indigo-800/50 flex gap-3 cursor-pointer hover:scale-[1.02] transition-transform"
          onClick={() => onOpenDeepResearch()}
        >
          <span className="material-symbols-outlined text-indigo-600 dark:text-indigo-400 mt-1">
            science
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              Try Deep Research
            </span>
            <p className="text-xs text-indigo-900/70 dark:text-indigo-200/70 leading-relaxed">
              For an in-depth report and new sources!
            </p>
          </div>
        </div>

        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400 text-lg">
            search
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runSearch();
            }}
            className="w-full bg-element-light dark:bg-element-dark border-none rounded-full py-2 pl-10 pr-4 text-sm focus:ring-2 focus:ring-blue-500/50 placeholder-gray-500 dark:placeholder-gray-400 text-gray-800 dark:text-gray-200"
            placeholder={
              searchMode === "web"
                ? "Search the web..."
                : "Search my files..."
            }
            type="text"
          />
        </div>

        <div className="flex items-center gap-2 p-1 bg-element-light dark:bg-element-dark rounded-lg">
          <button
            type="button"
            onClick={() => {
              setSearchMode("local");
              setResults([]);
            }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              searchMode === "local"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <span className="material-symbols-outlined text-sm">folder</span>
            My Files
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("web")}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              searchMode === "web"
                ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <span className="material-symbols-outlined text-sm">language</span>
            Web
          </button>
        </div>

        {searchMode === "web" && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSearchType("fast")}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                searchType === "fast"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : "text-gray-500 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-300"
              }`}
            >
              <span className="material-symbols-outlined text-xs">bolt</span>
              Fast
            </button>
            <button
              type="button"
              onClick={() => setSearchType("deep")}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                searchType === "deep"
                  ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  : "text-gray-500 dark:text-gray-400 hover:text-green-700 dark:hover:text-green-300"
              }`}
            >
              <span className="material-symbols-outlined text-xs">
                science
              </span>
              Deep
            </button>
          </div>
        )}

        {searchMode === "web" && (results.length > 0 || searchWeb.isPending) && (
          <div className="mt-2 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col max-h-[60vh]">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {searchWeb.isPending
                  ? "Searching..."
                  : `${results.length} result(s)`}
              </span>
              {results.length > 0 && (
                <button
                  type="button"
                  onClick={addAll}
                  disabled={addFromUrl.isPending}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-full font-medium transition-colors disabled:opacity-50"
                >
                  Add All
                </button>
              )}
            </div>
            <div className="space-y-2 overflow-y-auto flex-1">
              {results.map((r) => (
                <div
                  key={r.url}
                  className="p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-xs"
                >
                  <p className="font-medium text-gray-800 dark:text-gray-200 line-clamp-2">
                    {r.title}
                  </p>
                  <p className="text-gray-500 line-clamp-2 mt-1">{r.snippet}</p>
                  <div className="flex items-center justify-between mt-2">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline truncate max-w-[60%]"
                    >
                      {new URL(r.url).hostname}
                    </a>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await addFromUrl.mutateAsync({
                            notebookId,
                            url: r.url,
                            title: r.title,
                          });
                          showToast(`Added ${r.title}`);
                        } catch (e) {
                          showToast((e as Error).message);
                        }
                      }}
                      className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-200"
                    >
                      Add
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 mt-2">
          {list.isPending && (
            <div className="space-y-2 animate-pulse">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2 p-2">
                  <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="flex-1 space-y-1">
                    <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded" />
                    <div className="h-2.5 w-1/3 bg-gray-200 dark:bg-gray-700 rounded" />
                  </div>
                </div>
              ))}
            </div>
          )}
          {!list.isPending && localFiltered.length === 0 && (
            <div className="mt-8 flex flex-col items-center justify-center text-center px-4 opacity-60">
              <span className="material-symbols-outlined text-4xl mb-3 text-gray-400">
                description
              </span>
              <p className="text-sm font-medium">
                Saved sources will appear here
              </p>
              <p className="text-xs mt-2 text-gray-500 dark:text-gray-400">
                Click Add source above to add PDFs, websites, text, videos or
                audio files.
              </p>
            </div>
          )}
          {localFiltered.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 ${
                s.status === "error"
                  ? "bg-red-50/50 dark:bg-red-500/5 border border-red-200/50 dark:border-red-500/10"
                  : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selectedSourceIds.includes(s.id)}
                onChange={() => toggleSelected(s.id)}
                className="shrink-0"
                disabled={s.status === "error"}
              />
              <span
                className={`material-symbols-outlined text-lg ${
                  s.status === "ready"
                    ? "text-blue-500"
                    : s.status === "error"
                      ? "text-red-500"
                      : "text-gray-400 animate-pulse"
                }`}
              >
                {s.status === "error"
                  ? "error"
                  : s.kind === "link"
                    ? "link"
                    : s.kind === "note"
                      ? "edit_note"
                      : s.kind === "text"
                        ? "text_snippet"
                        : "description"}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className={`text-[10px] capitalize ${
                  s.status === "error"
                    ? "text-red-500 dark:text-red-400"
                    : "text-gray-500"
                }`}>
                  {s.status}
                  {s.error ? ` — ${s.error.slice(0, 60)}` : ""}
                </p>
              </div>
              {s.status === "error" && (
                <button
                  type="button"
                  onClick={() => retry.mutate({ id: s.id })}
                  disabled={retry.isPending}
                  className="p-1 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  title="Retry"
                >
                  <span className="material-symbols-outlined text-base">
                    refresh
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => del.mutate({ id: s.id })}
                className={`p-1 transition-opacity ${
                  s.status === "error"
                    ? "opacity-100 text-red-400 hover:text-red-600"
                    : "opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500"
                }`}
                title="Delete"
              >
                <span className="material-symbols-outlined text-base">
                  {s.status === "error" ? "close" : "delete"}
                </span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
