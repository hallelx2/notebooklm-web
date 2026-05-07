"use client";

import { Button, IconButton, Spinner, Text, cn } from "@notebooklm/ui";
import { LoadingScreen } from "@notebooklm/ui/components/LoadingScreen";
import { Link, useAuth, useRouter } from "@notebooklm/ui/contexts";
import { trpc } from "@notebooklm/ui/trpc/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotebookCard } from "./NotebookCard";
import {
  NotebookGridSkeleton,
  NotebookListSkeleton,
} from "./NotebookSkeleton";
import { NotebooksHeader } from "./NotebooksHeader";

export function NotebooksView() {
  // ── Hooks (must run unconditionally on every render) ──
  const router = useRouter();
  const auth = useAuth();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "alpha">("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [listMenuOpenId, setListMenuOpenId] = useState<string | null>(null);
  const listMenuRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const list = trpc.notebook.list.useQuery(undefined, {
    enabled: !!auth.user,
  });
  const create = trpc.notebook.create.useMutation({
    onSuccess: (row) => {
      if (row) router.push(`/notebooks/${row.id}?onboard=1`);
    },
  });
  const deleteMut = trpc.notebook.delete.useMutation({
    onSuccess: () => {
      utils.notebook.list.invalidate();
    },
  });

  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace("/auth/sign-in");
    }
  }, [auth.status, router]);

  // Desktop menu bridge: Cmd/Ctrl-N (File > New Notebook).
  useEffect(() => {
    if (!auth.user) return;
    const handler = () => create.mutate({ title: "Untitled notebook" });
    window.addEventListener("notebooklm:new-notebook", handler);
    return () => window.removeEventListener("notebooklm:new-notebook", handler);
  }, [auth.user, create]);

  useEffect(() => {
    if (!listMenuOpenId) return;
    function handleClick(e: MouseEvent) {
      if (
        listMenuRef.current &&
        !listMenuRef.current.contains(e.target as Node)
      ) {
        setListMenuOpenId(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [listMenuOpenId]);

  const notebooks = useMemo(() => {
    const items = (list.data ?? []).slice();
    const q = query.trim().toLowerCase();
    const filtered = q
      ? items.filter(
          (n) =>
            n.title.toLowerCase().includes(q) ||
            (n.description ?? "").toLowerCase().includes(q),
        )
      : items;
    if (sort === "alpha") {
      filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      filtered.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }
    return filtered;
  }, [list.data, query, sort]);

  if (!auth.user) {
    return <LoadingScreen message="Loading your notebooks" />;
  }

  function handleDelete(id: string) {
    deleteMut.mutate({ id });
  }

  return (
    <div className="relative z-10 flex min-h-screen w-full flex-col bg-canvas text-fg overflow-x-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute left-12 top-0 bottom-0 w-[1px] bg-border-subtle hidden md:block" />
        <div className="absolute right-12 top-0 bottom-0 w-[1px] bg-border-subtle hidden md:block" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[45rem] h-[45rem] bg-accent-soft blur-[120px] rounded-full" />
      </div>

      <main className="flex-grow flex flex-col relative z-10">
        <NotebooksHeader
          count={list.data?.length ?? 0}
          query={query}
          setQuery={setQuery}
          sort={sort}
          setSort={setSort}
          view={view}
          setView={setView}
          onCreate={() => create.mutate({ title: "Untitled notebook" })}
          creating={create.isPending}
        />

        <div className="max-w-[1400px] w-full mx-auto px-4 sm:px-6 md:px-10 pb-20">
          {list.isPending ? (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Spinner size={14} className="text-fg-muted" />
                <Text variant="caption" tone="muted">
                  Loading notebooks
                </Text>
              </div>
              {view === "grid" ? (
                <NotebookGridSkeleton />
              ) : (
                <NotebookListSkeleton />
              )}
            </div>
          ) : notebooks.length === 0 ? (
            <div className="py-32 text-center border border-dashed border-border-subtle rounded-card">
              <span className="material-symbols-outlined text-4xl text-fg-muted mb-4 block">
                library_books
              </span>
              <Text variant="body" tone="secondary" className="text-sm mb-6">
                {query
                  ? "No notebooks match that search."
                  : "No notebooks yet. Spin one up to start researching."}
              </Text>
              <Button
                variant="soft"
                size="md"
                onClick={() => create.mutate({ title: "Untitled notebook" })}
                disabled={create.isPending}
                className="uppercase tracking-widest text-[10px] font-bold"
              >
                <span className="material-symbols-outlined text-[14px]">
                  add
                </span>
                New notebook
              </Button>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {notebooks.map((n) => (
                <NotebookCard
                  key={n.id}
                  id={n.id}
                  title={n.title}
                  description={n.description}
                  createdAt={n.createdAt}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-border-subtle border border-border-subtle rounded-card overflow-hidden">
              {notebooks.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-6 p-5 hover:bg-accent-soft transition-colors group relative"
                >
                  <Link
                    href={`/notebooks/${n.id}`}
                    className="absolute inset-0 z-0"
                  />
                  <div className="w-10 h-10 rounded-card bg-accent-soft border border-border-subtle flex items-center justify-center relative z-10">
                    <span className="material-symbols-outlined text-fg-accent text-lg">
                      book_2
                    </span>
                  </div>
                  <div className="flex-1 min-w-0 relative z-10">
                    <p className="font-semibold truncate group-hover:text-fg-accent transition-colors">
                      {n.title}
                    </p>
                    <Text
                      variant="body"
                      tone="muted"
                      className="text-xs line-clamp-1"
                    >
                      {n.description ?? "No description"}
                    </Text>
                  </div>
                  <Text
                    variant="meta"
                    tone="muted"
                    as="span"
                    className="shrink-0 relative z-10"
                  >
                    {new Date(n.createdAt).toLocaleDateString()}
                  </Text>

                  <div
                    ref={listMenuOpenId === n.id ? listMenuRef : undefined}
                    className="relative z-20"
                  >
                    <IconButton
                      variant="ghost"
                      size="sm"
                      icon="more_vert"
                      aria-label="More options"
                      title="More options"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setListMenuOpenId(
                          listMenuOpenId === n.id ? null : n.id,
                        );
                      }}
                      className="opacity-0 group-hover:opacity-100"
                    />

                    {listMenuOpenId === n.id && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-elevated border border-border-subtle rounded-card shadow-xl z-50 overflow-hidden">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setListMenuOpenId(null);
                            handleDelete(n.id);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-2.5 text-sm",
                            "text-danger hover:bg-danger/10 transition-colors",
                          )}
                        >
                          <span className="material-symbols-outlined text-[18px]">
                            delete
                          </span>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  <span className="material-symbols-outlined text-fg-muted group-hover:text-fg-accent transition-colors relative z-10">
                    arrow_forward
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
