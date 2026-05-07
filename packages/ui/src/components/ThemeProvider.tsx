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
 * Theme provider — drop-in replacement for `next-themes`'
 * <ThemeProvider> + useTheme(), extended with a second axis for
 * design-system pack selection ("saigon" | "render").
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
 * sets/unsets a class on <html> and toggles the data-ds attribute. No
 * node insertion or removal that React doesn't see. The FOUC fix lives
 * in an inline <script> in each app's HTML root
 * (apps/desktop/index.html, apps/web/src/app/layout.tsx) which runs
 * before React mounts.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export type DesignSystem = "saigon" | "render";

const THEME_STORAGE_KEY = "notebooklm-theme";
const DS_STORAGE_KEY = "notebooklm-ds";
const THEMES = ["light", "dark", "system"] as const;
const DESIGN_SYSTEMS = ["saigon", "render"] as const;
const DEFAULT_DS: DesignSystem = "saigon";

type ThemeContextValue = {
  /** What the user picked (`"system"` is allowed). */
  theme: Theme;
  setTheme: (next: Theme) => void;
  /** What's actually applied right now (resolves `"system"`). */
  resolvedTheme: ResolvedTheme;
  /** Always `["light", "dark", "system"]`. Matches next-themes' shape. */
  themes: readonly Theme[];
  /** Active design-system pack. */
  designSystem: DesignSystem;
  setDesignSystem: (next: DesignSystem) => void;
  /** Always `["saigon", "render"]`. */
  designSystems: readonly DesignSystem[];
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(THEME_STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

function readStoredDS(): DesignSystem {
  if (typeof window === "undefined") return DEFAULT_DS;
  const v = window.localStorage.getItem(DS_STORAGE_KEY);
  return v === "saigon" || v === "render" ? v : DEFAULT_DS;
}

function getSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(resolved: ResolvedTheme, ds: DesignSystem) {
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
  if (html.getAttribute("data-ds") !== ds) {
    html.setAttribute("data-ds", ds);
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initial state lazy-reads localStorage once. SSR (Next.js): both
  // `theme` and `systemPref` start with safe defaults, then get
  // corrected on the first client effect — that's fine because the
  // inline FOUC script in the document head has already painted with
  // the correct class and data-ds.
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [systemPref, setSystemPref] = useState<ResolvedTheme>(() =>
    getSystemPreference(),
  );
  const [designSystem, setDesignSystemState] = useState<DesignSystem>(() =>
    readStoredDS(),
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

  // Apply class + attribute to <html>. Idempotent — the inline FOUC
  // script already set them before React mounted; we just keep them in
  // sync when the user toggles or system preference changes.
  useEffect(() => {
    applyTheme(resolvedTheme, designSystem);
  }, [resolvedTheme, designSystem]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Quota / private mode — non-fatal. The class still flips for
      // this session, just won't persist.
    }
  }, []);

  const setDesignSystem = useCallback((next: DesignSystem) => {
    setDesignSystemState(next);
    try {
      window.localStorage.setItem(DS_STORAGE_KEY, next);
    } catch {
      // Same story — session-only flip is acceptable.
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      themes: THEMES,
      designSystem,
      setDesignSystem,
      designSystems: DESIGN_SYSTEMS,
    }),
    [theme, setTheme, resolvedTheme, designSystem, setDesignSystem],
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
      designSystem: DEFAULT_DS,
      setDesignSystem: () => {},
      designSystems: DESIGN_SYSTEMS,
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
 * Kept here so the storage keys + class names + default pack stay in
 * lock-step with the provider above — change one, change both.
 */
export const FOUC_PREVENTION_SCRIPT = `
(function(){try{
  var tk='${THEME_STORAGE_KEY}';
  var dk='${DS_STORAGE_KEY}';
  var s=localStorage.getItem(tk);
  var sysDark=window.matchMedia('(prefers-color-scheme: dark)').matches;
  var r=s==='light'?'light':s==='dark'?'dark':(sysDark?'dark':'light');
  var d=localStorage.getItem(dk);
  d=(d==='saigon'||d==='render')?d:'${DEFAULT_DS}';
  var h=document.documentElement;
  h.classList.add(r);
  h.classList.remove(r==='dark'?'light':'dark');
  h.style.colorScheme=r;
  h.setAttribute('data-ds',d);
}catch(_){}})();`.trim();
