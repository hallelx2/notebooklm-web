"use client";

type SortKey = "recent" | "alpha";

type Props = {
  count: number;
  query: string;
  setQuery: (q: string) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  view: "grid" | "list";
  setView: (v: "grid" | "list") => void;
  onCreate: () => void;
  creating: boolean;
};

export function NotebooksHeader({
  count,
  query,
  setQuery,
  sort,
  setSort,
  view,
  setView,
  onCreate,
  creating,
}: Props) {
  return (
    <div className="relative z-10 max-w-[1400px] w-full mx-auto px-6 md:px-10 pt-14">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-slate-200 dark:border-white/10">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              Library · {count} notebook{count === 1 ? "" : "s"}
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-medium tracking-tighter text-slate-900 dark:text-white">
            Your
            <br />
            Notebooks
          </h1>
        </div>
        <div className="max-w-md text-right lg:text-left">
          <p className="text-slate-500 dark:text-zinc-400 font-light text-lg leading-relaxed">
            Research workspaces with their own sources, memory, and tools.{" "}
            <span className="text-slate-900 dark:text-white">
              Spin up a new one in seconds.
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between mt-8 mb-10 sticky top-0 z-30 bg-white/80 dark:bg-[#050505]/90 backdrop-blur-md py-4 border-b border-slate-200 dark:border-white/10">
        <div className="flex flex-wrap gap-[-1px] items-center">
          {(
            [
              { id: "recent" as const, label: "Recent" },
              { id: "alpha" as const, label: "A–Z" },
            ] satisfies { id: SortKey; label: string }[]
          ).map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSort(s.id)}
              className={`flex items-center gap-3 px-5 py-3 border text-[10px] font-bold uppercase tracking-widest transition-colors min-w-[120px] justify-between ${
                sort === s.id
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-slate-300 hover:border-slate-900 text-slate-700 dark:border-white/20 dark:hover:border-white dark:text-zinc-300"
              } ${i > 0 ? "-ml-[1px]" : ""}`}
            >
              <span>{s.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="flex items-center gap-3 px-5 py-3 border border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white dark:hover:text-black transition-colors -ml-[1px] disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            <span>{creating ? "Creating" : "New"}</span>
          </button>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="relative w-full lg:w-72">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-500 transition-colors"
              placeholder="SEARCH NOTEBOOKS..."
              type="text"
            />
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500 text-sm">
              search
            </span>
          </div>
          <div className="hidden md:flex gap-1 border border-slate-200 dark:border-white/10 p-1 bg-white dark:bg-[#0a0a0a]">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`p-2 transition-colors ${
                view === "grid"
                  ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/10"
                  : "text-slate-400 dark:text-zinc-600 hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                grid_view
              </span>
            </button>
            <button
              type="button"
              onClick={() => setView("list")}
              className={`p-2 transition-colors ${
                view === "list"
                  ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-white/10"
                  : "text-slate-400 dark:text-zinc-600 hover:bg-slate-50 dark:hover:bg-white/5"
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                view_list
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
