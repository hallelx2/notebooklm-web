"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * Custom theme provider — drop-in replacement for `next-themes`'
 * <ThemeProvider> + useTheme() with the same API surface.
 *
 * Why we ship our own:
 *   `next-themes` (with `disableTransitionOnChange`) appends a temporary
 *   <style> to document.head during theme changes via raw appendChild /
 *   removeChild. Under React 19's stricter reconciler, when a parent
 *   subtree unmounts (e.g. settings-tab navigation in TanStack Router)
 *   React tries to remove DOM nodes it remembers but can't find,
 *   throws `NotFoundError: Failed to execute 'removeChild' on 'Node'`,
 *   and the unmount bails out partway through — leaving the old subtree
 *   attached to the DOM while the new route mounts above it. The
 *   visible symptom is the entire page rendering N times stacked.
 *
 * This provider never touches the DOM outside a useEffect that only
 * sets/unsets a class on <html>. No node insertion or removal that
 * React doesn't see. The FOUC fix moves to an inline <script> in each
 * app's HTML root (apps/desktop/index.html, apps/web/src/app/layout.tsx)
 * which runs before React mounts.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "notebooklm-theme";
const THEMES = ["light", "dark", "system"] as const;

type ThemeContextValue = {
  /** What the user picked (`"system"` is allowed). */
  theme: Theme;
  setTheme: (next: Theme) => void;
  /** What's actually applied right now (resolves `"system"`). */
  resolvedTheme: ResolvedTheme;
  /** Always `["light", "dark", "system"]`. Matches next-themes' shape. */
  themes: readonly Theme[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function getSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyClass(resolved: ResolvedTheme) {
  const html = document.documentElement;
  if (resolved === "dark") {
    html.classList.add("dark");
    html.classList.remove("light");
  } else {
    html.classList.add("light");
    html.classList.remove("dark");
  }
  // Native form controls / scrollbars pick this up.
  html.style.colorScheme = resolved;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial state lazy-reads localStorage once. SSR (Next.js): both
  // `theme` and `systemPref` start with safe defaults, then get
  // corrected on the first client effect — that's fine because the
  // inline FOUC script in the document head has already painted with
  // the correct class.
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [systemPref, setSystemPref] = useState<ResolvedTheme>(() =>
    getSystemPreference(),
  );

  // Track OS-level preference flips ("system" mode follows along).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) =>
      setSystemPref(e.matches ? "dark" : "light");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme: ResolvedTheme =
    theme === "system" ? systemPref : theme;

  // Apply class to <html>. Idempotent — the inline FOUC script already
  // set the same class before React mounted. We just keep it in sync
  // when the user toggles or system preference changes.
  useEffect(() => {
    applyClass(resolvedTheme);
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Quota / private mode — non-fatal. The class still flips for
      // this session, just won't persist.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, setTheme, resolvedTheme, themes: THEMES }),
    [theme, setTheme, resolvedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/**
 * Drop-in replacement for `next-themes`' useTheme(). Returns safe
 * defaults outside the provider (matches next-themes' behaviour — some
 * consumers render in error boundaries or during router transitions
 * where the provider hasn't mounted yet).
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "system",
      setTheme: () => {},
      resolvedTheme: "light",
      themes: THEMES,
    };
  }
  return ctx;
}

/**
 * Inline <script> body that runs in the document head before React
 * loads. Eliminates the flash-of-unthemed-content. Apps embed this in
 * their HTML root (apps/desktop/index.html for Vite,
 * apps/web/src/app/layout.tsx for Next.js).
 *
 * Kept here so the storage key + class names stay in lock-step with
 * the provider above — change one, change both.
 */
export const FOUC_PREVENTION_SCRIPT = `
(function(){try{
  var k='${STORAGE_KEY}';
  var s=localStorage.getItem(k);
  var sysDark=window.matchMedia('(prefers-color-scheme: dark)').matches;
  var r=s==='light'?'light':s==='dark'?'dark':(sysDark?'dark':'light');
  var h=document.documentElement;
  h.classList.add(r);
  h.classList.remove(r==='dark'?'light':'dark');
  h.style.colorScheme=r;
}catch(_){}})();`.trim();
