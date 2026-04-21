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
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 pb-8 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3 mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-widest text-zinc-400">
              Library · {count} notebook{count === 1 ? "" : "s"}
            </span>
          </div>
          <h1 className="text-5xl md:text-6xl font-medium tracking-tighter text-white">
            Your
            <br />
            Notebooks
          </h1>
        </div>
        <div className="max-w-md text-right lg:text-left">
          <p className="text-zinc-400 font-light text-lg leading-relaxed">
            Research workspaces with their own sources, memory, and tools.{" "}
            <span className="text-white">Spin up a new one in seconds.</span>
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between mt-8 mb-10 sticky top-0 z-30 bg-[#050505]/90 backdrop-blur-sm py-4 border-b border-white/10">
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
                  ? "border-white bg-white text-black"
                  : "border-white/20 hover:border-white text-zinc-300"
              } ${i > 0 ? "-ml-[1px]" : ""}`}
            >
              <span>{s.label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="flex items-center gap-3 px-5 py-3 border border-emerald-500/50 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-black transition-colors -ml-[1px] disabled:opacity-60"
          >
            <span className="material-symbols-outlined text-[14px]">
              add
            </span>
            <span>{creating ? "Creating" : "New"}</span>
          </button>
        </div>

        <div className="flex items-center gap-4 w-full lg:w-auto">
          <div className="relative w-full lg:w-72">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-white/20 px-4 py-3 text-xs font-bold uppercase tracking-wider text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="SEARCH NOTEBOOKS..."
              type="text"
            />
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">
              search
            </span>
          </div>
          <div className="hidden md:flex gap-1 border border-white/10 p-1 bg-[#0a0a0a]">
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`p-2 transition-colors ${
                view === "grid"
                  ? "text-white bg-white/10"
                  : "text-zinc-600 hover:bg-white/5"
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
                  ? "text-white bg-white/10"
                  : "text-zinc-600 hover:bg-white/5"
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
