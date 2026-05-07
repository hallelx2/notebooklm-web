"use client";

import { Text, cn } from "@notebooklm/ui";
import {
  type DesignSystem,
  useTheme,
} from "@notebooklm/ui/components/ThemeProvider";
import { useEffect, useState } from "react";
import { SettingsSection } from "./SettingsSection";

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

const DESIGN_SYSTEMS: Array<{
  id: DesignSystem;
  label: string;
  tagline: string;
  description: string;
  swatches: { canvas: string; surface: string; accent: string };
}> = [
  {
    id: "saigon",
    label: "Saigon",
    tagline: "Atmospheric depth",
    description:
      "Dark, organic, immersive. Pill buttons, spacious rhythm, gradient atmosphere — designed by monopo saigon.",
    swatches: { canvas: "#000000", surface: "#181818", accent: "#a0e0ab" },
  },
  {
    id: "render",
    label: "Render",
    tagline: "Crisp clarity",
    description:
      "Light, sharp, vibrant. Tight typography, 0px corners, purple → sunset accents — inspired by Render.",
    swatches: { canvas: "#ffffff", surface: "#f6f0ff", accent: "#8a05ff" },
  },
];

export function AppearanceView() {
  const { theme, setTheme, designSystem, setDesignSystem } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <SettingsSection
      tagline="Settings · Appearance"
      title="Appearance"
      description="Choose your design system and tone. Both preferences are stored on this device only."
    >
      {/* Design system picker */}
      <div className="mb-12">
        <div className="flex items-center gap-3 mb-4">
          <Text variant="caption" tone="muted">
            Design system
          </Text>
          <span className="h-px flex-1 bg-border-subtle" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {DESIGN_SYSTEMS.map((opt) => {
            const active = mounted && designSystem === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setDesignSystem(opt.id)}
                className={cn(
                  "text-left p-6 border transition-colors rounded-card",
                  active
                    ? "border-fg-accent bg-accent-soft"
                    : "border-border-subtle hover:border-border-strong",
                )}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex gap-1.5">
                    {[
                      opt.swatches.canvas,
                      opt.swatches.surface,
                      opt.swatches.accent,
                    ].map((c, i) => (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length swatch row
                        key={i}
                        className="block h-6 w-6 rounded-full border border-border-subtle"
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  {active ? (
                    <Text variant="caption" tone="success">
                      Active
                    </Text>
                  ) : null}
                </div>
                <p className="text-base font-medium text-fg mb-1">
                  {opt.label}
                </p>
                <Text variant="caption" tone="muted" className="mb-3">
                  {opt.tagline}
                </Text>
                <Text
                  variant="body"
                  tone="secondary"
                  className="text-sm font-light leading-relaxed"
                >
                  {opt.description}
                </Text>
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme tone picker */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <Text variant="caption" tone="muted">
            Tone
          </Text>
          <span className="h-px flex-1 bg-border-subtle" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {THEMES.map((opt) => {
            const active = mounted && theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={cn(
                  "text-left p-5 border transition-colors rounded-card",
                  active
                    ? "border-fg-accent bg-accent-soft"
                    : "border-border-subtle hover:border-border-strong",
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={cn(
                      "material-symbols-outlined text-[24px]",
                      active ? "text-fg" : "text-fg-muted",
                    )}
                  >
                    {opt.icon}
                  </span>
                  {active ? (
                    <Text variant="caption" tone="success">
                      Active
                    </Text>
                  ) : null}
                </div>
                <p className="text-sm font-medium text-fg mb-1">{opt.label}</p>
                <Text
                  variant="body"
                  tone="muted"
                  className="text-xs font-light leading-relaxed"
                >
                  {opt.description}
                </Text>
              </button>
            );
          })}
        </div>
      </div>
    </SettingsSection>
  );
}
