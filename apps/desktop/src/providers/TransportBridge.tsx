import { TransportProvider } from "@notebooklm/ui/contexts";
import { trpc } from "@notebooklm/ui/trpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { type ReactNode, useState } from "react";

// Vite middleware mounts the Hono app on the same origin as the UI, so
// relative URLs work in dev. Phase 2 (Tauri sidecar on a fixed port)
// switches to absolute URLs against `http://localhost:1421`.
const transport = {
  chat: { url: "/api/chat" },
  endpoint: (path: string) => path,
};

export function TransportBridge({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [httpBatchLink({ url: "/api/trpc" })],
    }),
  );

  return (
    <TransportProvider transport={transport}>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </trpc.Provider>
    </TransportProvider>
  );
}
