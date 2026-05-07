"use client";

import { useTheme } from "@notebooklm/ui/components/ThemeProvider";
import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
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
 className={`inline-flex items-center justify-center w-9 h-9 rounded-md border border-border-subtle hover:border-border-strong bg-accent-soft transition-colors text-fg-secondary ${className}`}
 title={label}
 aria-label={label}
 >
 <span className="material-symbols-outlined text-[18px]">{icon}</span>
 </button>
 );
}
