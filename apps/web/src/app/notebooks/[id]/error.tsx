"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function NotebookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("notebook route error", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center flex-col gap-4 p-6 text-center">
      <h2 className="text-xl font-semibold">
        Something broke on this notebook.
      </h2>
      <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-xl break-words">
        {error.message}
        {error.digest ? (
          <span className="block text-xs opacity-60 mt-1">
            digest: {error.digest}
          </span>
        ) : null}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm hover:bg-blue-700"
        >
          Try again
        </button>
        <Link
          href="/notebooks"
          className="px-4 py-2 rounded-full border border-slate-300 dark:border-white/20 text-sm hover:bg-slate-50 dark:hover:bg-white/5"
        >
          Back to notebooks
        </Link>
      </div>
    </main>
  );
}
