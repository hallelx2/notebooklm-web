import { RouterProvider as TanRouterProvider } from "@tanstack/react-router";
import { Component, type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./main.css";
import { router } from "./routes";

/**
 * Wire main-process menu commands into router navigation.
 *
 * The Electron preload (`apps/desktop/electron/preload.cjs`) exposes
 * `window.notebooklm.onMenuCommand` via contextBridge. Each command name
 * maps to a navigation target; once the route mounts, page-level effects
 * (e.g. NotebooksView listening for `notebooklm:new-notebook` window
 * events) handle any follow-up action.
 *
 * The `onMenuCommand` handle is registered exactly once at boot. The
 * preload's listener cleanup is exposed but unused — the desktop app
 * doesn't unmount its root, so leaking is fine.
 */
function wireMenuBridge() {
  if (typeof window === "undefined") return;
  const bridge = window.notebooklm;
  if (!bridge) return; // running under `dev:browser` (no Electron) — no bridge

  bridge.onMenuCommand(async (cmd) => {
    if (cmd === "new-notebook") {
      // Navigate to the notebooks list, then nudge the page to create one.
      // NotebooksView listens for the window event and calls trpc.notebook
      // .create.useMutation.mutate() on receipt. setTimeout(0) is the
      // simplest way to let the new route mount + attach its listener.
      await router.navigate({ to: "/notebooks" });
      setTimeout(() => {
        window.dispatchEvent(new Event("notebooklm:new-notebook"));
      }, 0);
    } else if (cmd === "open-settings") {
      router.navigate({ to: "/settings/profile" });
    }
  });
}

wireMenuBridge();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

/**
 * Visible-on-page error boundary so a runtime render error inside the
 * router or any of the bridges doesn't leave the Electron window blank.
 * The DevTools console still logs the full stack; this is just so you
 * never have to open them to know something exploded.
 */
class FatalBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
    console.error("[NotebookLM Desktop] fatal render error", error, info);
  }
  render() {
    if (this.state.error) {
      const err = this.state.error;
      return (
        <div
          style={{
            padding: 24,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 13,
            color: "#fca5a5",
            background: "#0b0b0b",
            minHeight: "100vh",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
          }}
        >
          <h1
            style={{
              color: "#f87171",
              fontSize: 20,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            Desktop render crashed
          </h1>
          <div style={{ color: "#fbbf24", marginBottom: 8 }}>{err.message}</div>
          <div style={{ color: "#9ca3af" }}>{err.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Catch unhandled async errors too — useSession's fetch failure, etc.
window.addEventListener("error", (e) => {
  // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
  console.error("[NotebookLM Desktop] window error", e.error ?? e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
  console.error("[NotebookLM Desktop] unhandled rejection", e.reason);
});

createRoot(rootEl).render(
  <StrictMode>
    <FatalBoundary>
      <TanRouterProvider router={router} />
    </FatalBoundary>
  </StrictMode>,
);
