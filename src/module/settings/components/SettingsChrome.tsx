"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { signOut } from "@/lib/auth-client";
import type { ServerUser } from "@/lib/auth-server";

/**
 * Top-bar chrome shared by every page under `/settings/*`. Mirrors the
 * notebooks dashboard header so navigating between Library and Settings
 * feels like one app.
 */
export function SettingsChrome({ user }: { user: ServerUser }) {
  const router = useRouter();

  return (
    <header className="relative z-20 border-b border-slate-200 dark:border-white/10">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 md:px-10 h-14 flex items-center justify-between gap-2">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
            <span className="w-7 h-7 rounded-md bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-white text-sm icon-filled">
                book_2
              </span>
            </span>
            <span className="font-medium tracking-tight text-sm">
              NotebookLM
            </span>
          </Link>
          <span className="hidden sm:inline-block h-4 w-px bg-slate-300 dark:bg-white/10" />
          <Link
            href="/notebooks"
            className="hidden sm:inline-flex items-center gap-1 text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">
              arrow_back
            </span>
            Library
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="hidden md:inline text-xs text-slate-500 dark:text-zinc-500 font-mono uppercase tracking-wider truncate max-w-[200px]">
            {user.email}
          </span>
          <ThemeToggle />
          <button
            type="button"
            onClick={() => signOut().then(() => router.push("/"))}
            className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition-colors whitespace-nowrap"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
