"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { SettingsSection } from "../components/SettingsSection";

const THEMES = [
  {
    id: "light" as const,
    label: "Light",
    icon: "light_mode",
    description: "Clean and bright. Best for daytime work.",
  },
  {
    id: "dark" as const,
    label: "Dark",
    icon: "dark_mode",
    description: "Easier on the eyes. Best for late-night research.",
  },
  {
    id: "system" as const,
    label: "System",
    icon: "computer",
    description: "Follows your OS preference automatically.",
  },
];

export function AppearanceView() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <SettingsSection
      tagline="Settings · Appearance"
      title="Appearance"
      description="Choose how the app looks. Your preference is stored on this device only."
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {THEMES.map((opt) => {
          const active = mounted && theme === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              className={`text-left p-5 border transition-colors ${
                active
                  ? "border-slate-900 bg-slate-900/5 dark:border-white dark:bg-white/5"
                  : "border-slate-200 hover:border-slate-400 dark:border-white/10 dark:hover:border-white/30"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span
                  className={`material-symbols-outlined text-[24px] ${
                    active
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-500 dark:text-zinc-500"
                  }`}
                >
                  {opt.icon}
                </span>
                {active ? (
                  <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                    Active
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-medium text-slate-900 dark:text-white mb-1">
                {opt.label}
              </p>
              <p className="text-xs text-slate-500 dark:text-zinc-400 font-light leading-relaxed">
                {opt.description}
              </p>
            </button>
          );
        })}
      </div>
    </SettingsSection>
  );
}
