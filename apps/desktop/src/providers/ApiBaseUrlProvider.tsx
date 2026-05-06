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
  useCallback,
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
 * Default per-request timeout for the trpc + Better Auth fetches. The
 * embedded server is on the loopback so 15s is generous; what we're
 * really guarding against is the server having crashed or wedged,
 * not slow networks.
 */
export const API_REQUEST_TIMEOUT_MS = 15_000;

/** Healthcheck timeout — short, since this is a localhost ping. */
const HEALTHCHECK_TIMEOUT_MS = 5_000;

/**
 * Wrap the platform `fetch` with a hard per-request timeout via
 * AbortSignal. Without this an unresponsive server leaves the
 * renderer's spinners (e.g. SignUpView's "Creating…") stuck forever
 * — the visible bug that drove this bridge work in the first place.
 *
 * Composes with any caller-supplied `signal`: whichever fires first
 * aborts the request. If the caller didn't pass a signal, we own
 * the AbortController.
 */
export function fetchWithTimeout(timeoutMs: number): typeof fetch {
  return async (input, init) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      ctrl.abort(new DOMException("request timed out", "TimeoutError"));
    }, timeoutMs);
    const onAbort = () => ctrl.abort(init?.signal?.reason);
    init?.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      return await fetch(input, { ...init, signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener("abort", onAbort);
    }
  };
}

/**
 * Probe the server with a short fetch. Any HTTP response (even 401 /
 * 404) means the server is alive — we're only checking that something
 * is listening on the port. Network-level failures (ECONNREFUSED,
 * ENOTFOUND, AbortError) bubble out as a thrown error.
 */
async function healthcheck(baseUrl: string): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(
    () => ctrl.abort(new DOMException("healthcheck timed out", "TimeoutError")),
    HEALTHCHECK_TIMEOUT_MS,
  );
  try {
    // `/api/auth/get-session` is a Better Auth endpoint that returns
    // 200 + null when there's no session. Cheap, side-effect-free, and
    // it confirms both the http server AND that Better Auth is mounted.
    await fetch(`${baseUrl}/api/auth/get-session`, {
      signal: ctrl.signal,
      // We don't care what the response says, just that we got one.
      // Defensive: avoid letting the browser cache an outage.
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

type GateState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; url: string | null; error: string };

/**
 * Gates rendering until the API base URL is known AND the server
 * answers a healthcheck. Surfaces a real error UI with a Retry
 * button if the server isn't reachable, so the user isn't stuck
 * watching a forever-spinner the way we were before.
 */
export function ApiBaseUrlGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ status: "loading" });
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let url: string | null = null;
      try {
        url = await detectApiBaseUrl();
        await healthcheck(url);
        if (!cancelled) setState({ status: "ready", url });
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "unknown error";
        setState({ status: "error", url, error: message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRetryToken((n) => n + 1);
  }, []);

  if (state.status === "loading") {
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

  if (state.status === "error") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050505",
          color: "#e2e8f0",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 480, textAlign: "center" }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: "0 0 8px" }}>
            Couldn't reach the local server
          </h1>
          <p
            style={{
              color: "#94a3b8",
              fontSize: 13,
              lineHeight: 1.5,
              margin: "0 0 20px",
            }}
          >
            NotebookLM runs an API server in the background for storage, chat,
            and audio. It didn't respond on{" "}
            <code style={{ color: "#cbd5e1" }}>{state.url ?? "(unknown)"}</code>
            .
            <br />
            Quitting and reopening usually fixes it. If this keeps happening,
            please file a bug with the message below.
          </p>
          <pre
            style={{
              background: "#0b0b0b",
              color: "#fca5a5",
              fontSize: 12,
              padding: 12,
              borderRadius: 6,
              textAlign: "left",
              overflowX: "auto",
              border: "1px solid #1e293b",
              margin: "0 0 20px",
            }}
          >
            {state.error}
          </pre>
          <button
            type="button"
            onClick={retry}
            style={{
              background: "#2563eb",
              color: "white",
              border: "none",
              padding: "8px 16px",
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <ApiBaseUrlContext.Provider value={state.url}>
      {children}
    </ApiBaseUrlContext.Provider>
  );
}
