"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { signOut, useSession } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { NotebookCard } from "../components/NotebookCard";
import { NotebooksHeader } from "../components/NotebooksHeader";

export function NotebooksView() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "alpha">("recent");
  const [view, setView] = useState<"grid" | "list">("grid");

  const list = trpc.notebook.list.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const create = trpc.notebook.create.useMutation({
    onSuccess: (row) => {
      if (row) router.push(`/notebooks/${row.id}?onboard=1`);
    },
  });

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

  if (isPending) {
    return (
      <main className="min-h-screen bg-white dark:bg-[#050505] text-slate-900 dark:text-white flex items-center justify-center text-slate-500 dark:text-zinc-500">
        Loading...
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="min-h-screen bg-white dark:bg-[#050505] text-slate-900 dark:text-white flex items-center justify-center flex-col gap-4">
        <p className="text-slate-500 dark:text-zinc-400">
          Please sign in to view your notebooks.
        </p>
        <Link
          href="/auth/sign-in"
          className="px-6 py-3 border border-slate-900 dark:border-white text-xs font-bold uppercase tracking-widest hover:bg-slate-900 dark:hover:bg-white hover:text-white dark:hover:text-black transition-colors"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <div className="relative z-10 flex min-h-screen w-full flex-col bg-white dark:bg-[#050505] text-slate-900 dark:text-white overflow-x-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute left-12 top-0 bottom-0 w-[1px] bg-slate-200 dark:bg-white/5 hidden md:block" />
        <div className="absolute right-12 top-0 bottom-0 w-[1px] bg-slate-200 dark:bg-white/5 hidden md:block" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[45rem] h-[45rem] bg-blue-400/15 dark:bg-blue-500/10 blur-[120px] rounded-full" />
      </div>

      <header className="relative z-20 border-b border-slate-200 dark:border-white/10">
        <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-md bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-white text-sm icon-filled">
                book_2
              </span>
            </span>
            <span className="font-medium tracking-tight text-sm">
              NotebookLM
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-slate-500 dark:text-zinc-500 font-mono uppercase tracking-wider">
              {session.user.email}
            </span>
            <ThemeToggle />
            <button
              type="button"
              onClick={() => signOut().then(() => router.push("/"))}
              className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

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

        <div className="max-w-[1400px] w-full mx-auto px-6 md:px-10 pb-24">
          {notebooks.length === 0 ? (
            <div className="py-32 text-center border border-dashed border-slate-300 dark:border-white/10">
              <span className="material-symbols-outlined text-4xl text-slate-400 dark:text-zinc-700 mb-4 block">
                library_books
              </span>
              <p className="text-slate-500 dark:text-zinc-400 text-sm mb-6">
                {query
                  ? "No notebooks match that search."
                  : "No notebooks yet. Spin one up to start researching."}
              </p>
              <button
                type="button"
                onClick={() => create.mutate({ title: "Untitled notebook" })}
                disabled={create.isPending}
                className="px-6 py-3 border border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white dark:hover:text-black transition-colors disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[14px] align-middle mr-2">
                  add
                </span>
                New notebook
              </button>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {notebooks.map((n) => (
                <NotebookCard
                  key={n.id}
                  id={n.id}
                  title={n.title}
                  description={n.description}
                  createdAt={n.createdAt}
                />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-white/5 border border-slate-200 dark:border-white/10">
              {notebooks.map((n) => (
                <Link
                  key={n.id}
                  href={`/notebooks/${n.id}`}
                  className="flex items-center gap-6 p-5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors group"
                >
                  <div className="w-10 h-10 rounded-md bg-gradient-to-tr from-blue-500/20 to-indigo-600/20 border border-slate-200 dark:border-white/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600 dark:text-blue-300 text-lg">
                      book_2
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-zinc-500 line-clamp-1">
                      {n.description ?? "No description"}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-zinc-500 shrink-0">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                  <span className="material-symbols-outlined text-slate-400 dark:text-zinc-600 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                    arrow_forward
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
