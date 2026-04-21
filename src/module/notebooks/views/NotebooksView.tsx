"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";

export function NotebooksView() {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [creating, setCreating] = useState(false);

  const list = trpc.notebook.list.useQuery(undefined, {
    enabled: !!session?.user,
  });
  const create = trpc.notebook.create.useMutation({
    onSuccess: (row) => {
      if (row) router.push(`/notebooks/${row.id}`);
    },
  });

  if (isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </main>
    );
  }

  if (!session?.user) {
    return (
      <main className="min-h-screen flex items-center justify-center flex-col gap-4">
        <p>Please sign in to view your notebooks.</p>
        <Link
          href="/auth/sign-in"
          className="px-6 py-3 rounded-full bg-blue-600 text-white font-medium hover:bg-blue-700"
        >
          Sign in
        </Link>
      </main>
    );
  }

  async function onCreate() {
    setCreating(true);
    await create.mutateAsync({ title: "Untitled notebook" });
    setCreating(false);
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-white/80 dark:bg-background-dark/80 backdrop-blur-lg border-b border-gray-200 dark:border-border-dark">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
              <span className="material-symbols-outlined text-white icon-filled">
                book_2
              </span>
            </div>
            <span className="text-xl font-bold tracking-tight">NotebookLM</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{session.user.email}</span>
            <button
              type="button"
              onClick={() => signOut().then(() => router.push("/"))}
              className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-white"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">My notebooks</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Create a notebook to add sources and start chatting.
            </p>
          </div>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || create.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            <span className="material-symbols-outlined">add</span>
            {creating || create.isPending ? "Creating..." : "New notebook"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.data?.map((n) => (
            <Link
              key={n.id}
              href={`/notebooks/${n.id}`}
              className="rounded-2xl border border-gray-200 dark:border-border-dark p-6 hover:border-blue-500 transition-colors"
            >
              <h3 className="font-semibold mb-1">{n.title}</h3>
              <p className="text-sm text-gray-500 line-clamp-2">
                {n.description ?? "No description"}
              </p>
              <p className="text-xs text-gray-400 mt-4">
                {new Date(n.createdAt).toLocaleDateString()}
              </p>
            </Link>
          ))}
          {list.data && list.data.length === 0 && (
            <div className="col-span-full text-gray-500 text-sm">
              No notebooks yet. Click "New notebook" to create one.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
