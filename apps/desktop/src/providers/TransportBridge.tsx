import { TransportProvider } from "@notebooklm/ui/contexts";
import { trpc } from "@notebooklm/ui/trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { type ReactNode, useMemo, useState } from "react";
import {
  API_REQUEST_TIMEOUT_MS,
  fetchWithTimeout,
  useApiBaseUrl,
} from "./ApiBaseUrlProvider";

/**
 * Bind the trpc + chat clients to the embedded API server's actual
 * origin. In dev that's the vite URL (`http://localhost:5173`); in
 * the packaged Electron app it's `http://127.0.0.1:<random-port>`,
 * resolved once at boot via the preload contextBridge — see
 * `ApiBaseUrlProvider`.
 *
 * Going through absolute URLs here (rather than relative `/api/*`)
 * is what makes the packaged app work at all: the renderer is
 * served from `file://...` and a relative fetch would resolve to
 * `file:///api/trpc`, which has no listener.
 */
export function TransportBridge({ children }: { children: ReactNode }) {
  const apiBaseUrl = useApiBaseUrl();

  const transport = useMemo(
    () => ({
      chat: { url: `${apiBaseUrl}/api/chat` },
      endpoint: (path: string) =>
        path.startsWith("http") ? path : `${apiBaseUrl}${path}`,
    }),
    [apiBaseUrl],
  );

  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${apiBaseUrl}/api/trpc`,
          // Per-request timeout so a wedged server surfaces as a
          // tRPC error after 15s instead of a UI stuck on "Loading…".
          fetch: fetchWithTimeout(API_REQUEST_TIMEOUT_MS),
        }),
      ],
    }),
  );

  return (
    <TransportProvider transport={transport}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </trpc.Provider>
    </TransportProvider>
  );
}
