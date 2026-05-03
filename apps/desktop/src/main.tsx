import { RouterProvider as TanRouterProvider } from "@tanstack/react-router";
import { Component, type ReactNode, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./main.css";
import { router } from "./routes";

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
