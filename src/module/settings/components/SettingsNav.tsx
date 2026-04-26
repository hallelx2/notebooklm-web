"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Horizontal section nav for `/settings/*`. Mirrors the sticky filter row
 * from the notebooks dashboard (sharp-cornered tabs, monospace label,
 * solid active state).
 */

const SECTIONS = [
  { href: "/settings/profile", label: "Profile", icon: "person" },
  { href: "/settings/providers", label: "Providers", icon: "key" },
  { href: "/settings/models", label: "Models", icon: "smart_toy" },
  { href: "/settings/appearance", label: "Appearance", icon: "palette" },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <div className="relative z-10 max-w-[1400px] w-full mx-auto px-4 sm:px-6 md:px-10">
      <div className="flex items-stretch w-full overflow-x-auto no-scrollbar mt-8 mb-10 sticky top-0 z-30 bg-white/80 dark:bg-[#050505]/90 backdrop-blur-md py-4 border-b border-slate-200 dark:border-white/10">
        {SECTIONS.map((s, i) => {
          const active =
            pathname === s.href || pathname.startsWith(`${s.href}/`);
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`flex items-center justify-center gap-2 h-11 flex-1 sm:flex-none sm:min-w-[140px] px-4 border text-[10px] font-bold uppercase tracking-widest transition-colors ${
                active
                  ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-black"
                  : "border-slate-300 hover:border-slate-900 text-slate-700 dark:border-white/20 dark:hover:border-white dark:text-zinc-300"
              } ${i > 0 ? "-ml-[1px]" : ""}`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {s.icon}
              </span>
              {s.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
