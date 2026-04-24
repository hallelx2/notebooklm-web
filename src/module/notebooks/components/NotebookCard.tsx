"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date | string;
  sourceCount?: number;
  onDelete?: (id: string) => void;
};

const STEP_LABELS = ["SOURCES", "EMBED", "CHAT", "STUDIO"];

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "TODAY";
  if (diff === 1) return "YESTERDAY";
  if (diff < 7) return `${diff}D AGO`;
  if (diff < 30) return `${Math.floor(diff / 7)}W AGO`;
  return date
    .toLocaleDateString(undefined, { month: "short", day: "2-digit" })
    .toUpperCase();
}

export function NotebookCard({
  id,
  title,
  description,
  createdAt,
  sourceCount = 0,
  onDelete,
}: Props) {
  const activeStep = sourceCount > 0 ? 2 : 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <Link
      href={`/notebooks/${id}`}
      className="group relative bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 hover:border-blue-500/60 dark:hover:border-blue-500/50 transition-all duration-300 p-5 sm:p-6 flex flex-col gap-4 sm:gap-5 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-blue-100/50 dark:to-blue-900/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="flex justify-between items-start relative z-10 gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors line-clamp-2">
            {title}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono uppercase tracking-wider">
              {formatDate(createdAt)}
            </span>
            <span className="w-1 h-1 bg-slate-300 dark:bg-zinc-700 rounded-full" />
            <span className="text-[10px] text-slate-500 dark:text-zinc-500 font-mono uppercase tracking-wider">
              {sourceCount} source{sourceCount === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="px-2.5 py-1 rounded-sm flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              Active
            </span>
          </div>

          {onDelete && (
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
                className="p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-white/10 transition-all"
                title="More options"
              >
                <span className="material-symbols-outlined text-[18px] text-slate-500 dark:text-zinc-400">
                  more_vert
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-[#1e1f20] border border-slate-200 dark:border-white/10 rounded-lg shadow-xl z-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete(id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      delete
                    </span>
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 dark:text-zinc-500 leading-relaxed relative z-10 line-clamp-2 min-h-[2.4em]">
        {description ?? "No description yet."}
      </p>

      <div className="flex items-center gap-1 relative z-10 py-2 overflow-x-auto no-scrollbar">
        {STEP_LABELS.map((step, i) => {
          const reached = i <= activeStep;
          return (
            <div key={step} className="flex items-center gap-1">
              {i > 0 && (
                <div
                  className={`w-3 h-[1px] transition-colors ${
                    reached
                      ? "bg-blue-400/60 group-hover:bg-blue-500"
                      : "bg-slate-200 dark:bg-white/10"
                  }`}
                />
              )}
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1.5 border rounded-sm transition-colors ${
                  reached
                    ? "bg-blue-50 dark:bg-blue-500/5 border-blue-200 dark:border-blue-500/20 group-hover:border-blue-400 dark:group-hover:border-blue-500/40"
                    : "bg-slate-50 dark:bg-white/[0.03] border-slate-200 dark:border-white/5 group-hover:border-slate-300 dark:group-hover:border-white/10"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${
                    reached
                      ? "bg-blue-500 group-hover:bg-blue-600"
                      : "bg-slate-300 dark:bg-zinc-700"
                  }`}
                />
                <span
                  className={`text-[9px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                    reached
                      ? "text-blue-700 dark:text-blue-200"
                      : "text-slate-500 dark:text-zinc-500 group-hover:text-slate-700 dark:group-hover:text-zinc-300"
                  }`}
                >
                  {step}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mt-auto relative z-10">
        <span className="px-2 py-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-400 group-hover:border-blue-300 dark:group-hover:border-blue-500/20 group-hover:text-blue-700 dark:group-hover:text-blue-200 transition-colors">
          Private
        </span>
        <span className="px-2 py-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-zinc-400 group-hover:border-blue-300 dark:group-hover:border-blue-500/20 group-hover:text-blue-700 dark:group-hover:text-blue-200 transition-colors">
          Gemini 2.5
        </span>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-zinc-600 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors flex items-center gap-1">
          Open
          <span className="material-symbols-outlined text-[12px]">
            arrow_forward
          </span>
        </span>
      </div>
    </Link>
  );
}
