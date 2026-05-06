/**
 * Resolves the origin of the embedded API server once at boot and
 * exposes it via React context. Both `TransportBridge` (trpc client)
 * and `AuthBridge` (Better Auth client) read this to point their
 * fetches at `http://127.0.0.1:<port>` in production.
 *
 * The URL comes from `window.notebooklm.getApiBaseUrl()`, which is
 * an `ipcRenderer.invoke` call into the Electron main process. The
 * main process knows the URL because it called `startApiServer()`
 * before opening the BrowserWindow.
 *
 * In `dev:browser` mode (vite alone, no Electron), the bridge is
 * absent — vite's own middleware handles `/api/*` on the renderer's
 * origin, so we fall back to `window.location.origin`. The same
 * mechanism works in vanilla browser-tab dev.
 */

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

const ApiBaseUrlContext = createContext<string | null>(null);

export function useApiBaseUrl(): string {
  const value = useContext(ApiBaseUrlContext);
  if (value === null) {
    throw new Error(
      "useApiBaseUrl called outside ApiBaseUrlGate — did you forget to wrap the tree?",
    );
  }
  return value;
}

async function detectApiBaseUrl(): Promise<string> {
  if (typeof window === "undefined") return "";
  const bridge = window.notebooklm;
  if (bridge?.getApiBaseUrl) {
    try {
      const url = await bridge.getApiBaseUrl();
      if (typeof url === "string" && url.length > 0) return url;
    } catch {
      // Fall through to window.location.origin. Worst case we use
      // a same-origin fetch, which works under vite dev anyway.
    }
  }
  return window.location.origin;
}

/**
 * Gates rendering until the API base URL is known. We block instead
 * of rendering with a placeholder URL because the trpc + auth clients
 * are constructed once with the URL baked in — swapping it post-mount
 * is more invasive than just waiting one IPC round-trip (~1 ms).
 */
export function ApiBaseUrlGate({ children }: { children: ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    detectApiBaseUrl().then((resolved) => {
      if (!cancelled) setUrl(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (url === null) {
    // Brief loading state; on a healthy machine this resolves in
    // <50 ms because the main process registered the IPC handler
    // before the BrowserWindow even opened. We keep the markup
    // minimal so a stuck IPC doesn't paint half a UI.
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050505",
          color: "#94a3b8",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          fontSize: 13,
        }}
      >
        Connecting to local server…
      </div>
    );
  }

  return (
    <ApiBaseUrlContext.Provider value={url}>
      {children}
    </ApiBaseUrlContext.Provider>
  );
}
