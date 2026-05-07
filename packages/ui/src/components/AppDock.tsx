"use client";

import { useTheme } from "@notebooklm/ui/components/ThemeProvider";
import { Link, useAuth, useRouter } from "@notebooklm/ui/contexts";
import { type ReactNode, useEffect, useState } from "react";

/**
 * Vertical sidebar dock — the desktop app's universal chrome.
 *
 * Sits as a narrow icon-only pill on the left edge of the viewport,
 * vertically centered. Icons reveal their label as a tooltip pill that
 * slides in on hover — same backdrop-blur as the dock so the labels
 * feel like extensions of the same surface, not floating popovers.
 *
 * The dock is icon-only at rest so it stays out of the way; on hover
 * each item gets a per-icon label rather than expanding the whole rail.
 *
 * Page content needs `pl-20` (or similar left padding) so it doesn't
 * sit under the dock. The desktop layouts handle that wrapping.
 *
 * Props:
 *   - `showLibrary` — surface a "Library" link back to /notebooks. Hide
 *     when the user is already on /notebooks (default: true).
 *   - `showSettings` — surface a settings entry. Hide on /settings/*
 *     since the sidebar already shows that section (default: true).
 */
export function AppDock({
  showLibrary = true,
  showSettings = true,
}: {
  showLibrary?: boolean;
  showSettings?: boolean;
}) {
  const router = useRouter();
  const auth = useAuth();
  const user = auth.user;
  if (!user) return null;

  return (
    <div
      className="fixed left-4 top-1/2 -translate-y-1/2 z-40 pointer-events-none"
      role="presentation"
    >
      <nav
        aria-label="App dock"
        className="pointer-events-auto flex flex-col items-center gap-1 rounded-pill border border-border-subtle bg-overlay backdrop-blur-md px-1.5 py-2 shadow-2xl"
      >
        {/* Brand — also acts as Home (links to /notebooks). */}
        <DockItem
          href="/notebooks"
          label="Home"
          tooltip="NotebookLM — back to library"
          variant="brand"
        >
          <span className="w-7 h-7 rounded-card bg-accent flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-fg-on-accent text-[16px] icon-filled">
              book_2
            </span>
          </span>
        </DockItem>

        <DockDivider />

        {showLibrary ? (
          <DockItem href="/notebooks" label="Library" icon="home" />
        ) : null}

        {showSettings ? (
          <DockItem href="/settings" label="Settings" icon="settings" />
        ) : null}

        <DockThemeToggle />

        <DockDivider />

        <DockButton
          label={`Sign out (${user.email})`}
          icon="logout"
          tone="danger"
          onClick={() => auth.signOut().then(() => router.push("/"))}
        />
      </nav>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Internals                                                          */
/* ------------------------------------------------------------------ */

function DockItem({
  href,
  label,
  tooltip,
  icon,
  variant = "default",
  children,
}: {
  href: string;
  label: string;
  tooltip?: string;
  icon?: string;
  variant?: "default" | "brand";
  children?: ReactNode;
}) {
  return (
    <Tooltip label={tooltip ?? label}>
      <Link
        href={href}
        aria-label={label}
        className={
          variant === "brand"
            ? "inline-flex items-center justify-center w-11 h-11 rounded-pill hover:bg-accent-soft transition-colors"
            : "inline-flex items-center justify-center w-11 h-11 rounded-pill text-fg-secondary hover:text-fg hover:bg-accent-soft transition-colors"
        }
      >
        {children ?? (
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        )}
      </Link>
    </Tooltip>
  );
}

function DockButton({
  label,
  icon,
  tone = "default",
  onClick,
}: {
  label: string;
  icon: string;
  tone?: "default" | "danger";
  onClick: () => void;
}) {
  const colorCls =
    tone === "danger"
      ? "text-fg-muted hover:text-danger hover:bg-danger/10"
      : "text-fg-secondary hover:text-fg hover:bg-accent-soft";
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`inline-flex items-center justify-center w-11 h-11 rounded-pill transition-colors ${colorCls}`}
      >
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </button>
    </Tooltip>
  );
}

/**
 * Theme toggle adapted for the dock — matches the icon size + hit area
 * of the other dock items so the rail stays a clean vertical column.
 */
function DockThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // SSR / first-paint: render the dark icon as a placeholder so layout
  // doesn't shift when `resolvedTheme` becomes available client-side.
  const isDark = mounted && resolvedTheme === "dark";
  const icon = isDark ? "light_mode" : "dark_mode";
  const label = isDark ? "Switch to light" : "Switch to dark";

  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={label}
        className="inline-flex items-center justify-center w-11 h-11 rounded-pill text-fg-secondary hover:text-fg hover:bg-accent-soft transition-colors"
      >
        <span className="material-symbols-outlined text-[20px]">{icon}</span>
      </button>
    </Tooltip>
  );
}

/**
 * Per-icon hover label. Wraps a child with a small flex container; the
 * label sits to the right of the child and slides in on group-hover.
 *
 * Same backdrop-blur surface as the dock so labels feel like a single
 * material rather than a floating tooltip.
 */
function Tooltip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="group relative">
      {children}
      <span
        role="tooltip"
        aria-hidden="true"
        className="
          pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3
          whitespace-nowrap text-[11px] font-medium tracking-wide
          rounded-pill border border-border-subtle bg-overlay backdrop-blur-md
          px-3 py-1.5 text-fg shadow-lg
          opacity-0 -translate-x-1 transition-all duration-150 ease-out
          group-hover:opacity-100 group-hover:translate-x-0
          group-focus-within:opacity-100 group-focus-within:translate-x-0
        "
      >
        {label}
      </span>
    </div>
  );
}

function DockDivider() {
  return (
    <span aria-hidden="true" className="my-1 h-px w-6 bg-border-subtle" />
  );
}
