"use client";

import {
  Button,
  Heading,
  IconButton,
  Input,
  Text,
  cn,
} from "@notebooklm/ui";

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
    <div className="relative z-10 max-w-[1400px] w-full mx-auto px-4 sm:px-6 md:px-10 pt-10 sm:pt-14">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 lg:gap-8 pb-6 sm:pb-8 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            <Text variant="caption" tone="muted">
              Library · {count} notebook{count === 1 ? "" : "s"}
            </Text>
          </div>
          <Heading
            level="h1"
            weight="medium"
            className="text-4xl sm:text-5xl md:text-6xl tracking-tighter"
          >
            Your
            <br />
            Notebooks
          </Heading>
        </div>
        <Text
          variant="lead"
          tone="secondary"
          className="max-w-md lg:text-left"
        >
          Research workspaces with their own sources, memory, and tools.{" "}
          <span className="text-fg">Spin up a new one in seconds.</span>
        </Text>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center justify-between mt-8 mb-10 sticky top-0 z-30 bg-canvas/90 backdrop-blur-md py-4 border-b border-border-subtle">
        <div className="flex items-stretch gap-2 w-full lg:w-auto">
          {(
            [
              { id: "recent" as const, label: "Recent" },
              { id: "alpha" as const, label: "A–Z" },
            ] satisfies { id: SortKey; label: string }[]
          ).map((s) => (
            <Button
              key={s.id}
              variant={sort === s.id ? "primary" : "secondary"}
              size="md"
              onClick={() => setSort(s.id)}
              className="flex-1 sm:flex-none sm:min-w-[104px] uppercase tracking-widest text-[10px] font-bold"
            >
              {s.label}
            </Button>
          ))}
          <Button
            variant="soft"
            size="md"
            onClick={onCreate}
            disabled={creating}
            className="flex-1 sm:flex-none sm:min-w-[104px] uppercase tracking-widest text-[10px] font-bold"
          >
            <span className="material-symbols-outlined text-[14px]">add</span>
            <span>{creating ? "Creating" : "New"}</span>
          </Button>
        </div>

        <div className="flex items-stretch gap-2 w-full lg:w-auto">
          <div className="relative flex-1 lg:w-72 lg:flex-none">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="SEARCH NOTEBOOKS..."
              className="pr-10 text-xs font-bold uppercase tracking-wider placeholder:text-fg-muted"
            />
            <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted text-sm pointer-events-none">
              search
            </span>
          </div>
          <div className="hidden md:flex h-11 border border-border-subtle bg-surface rounded-input overflow-hidden">
            <IconButton
              variant="ghost"
              size="md"
              icon="grid_view"
              aria-label="Grid view"
              onClick={() => setView("grid")}
              className={cn(
                "w-10 rounded-none",
                view === "grid" && "bg-accent-soft text-fg",
              )}
            />
            <IconButton
              variant="ghost"
              size="md"
              icon="view_list"
              aria-label="List view"
              onClick={() => setView("list")}
              className={cn(
                "w-10 rounded-none",
                view === "list" && "bg-accent-soft text-fg",
              )}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
