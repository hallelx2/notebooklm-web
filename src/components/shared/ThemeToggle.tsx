"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle({
  className = "",
}: {
  className?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";
  const icon = mounted ? (isDark ? "light_mode" : "dark_mode") : "dark_mode";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-md border border-black/10 dark:border-white/10 hover:border-black/30 dark:hover:border-white/30 bg-white/60 dark:bg-white/5 transition-colors text-slate-700 dark:text-zinc-300 ${className}`}
      title={label}
      aria-label={label}
    >
      <span className="material-symbols-outlined text-[18px]">{icon}</span>
    </button>
  );
}
