import { createContext, type ReactNode, useContext } from "react";

export type Transport = {
  /** URL passed to AI SDK's DefaultChatTransport for the streaming chat endpoint. */
  chat: { url: string };
  /** Resolve a relative API path to a full URL. */
  endpoint(path: string): string;
};

const TransportContext = createContext<Transport | null>(null);

export function useTransport(): Transport {
  const t = useContext(TransportContext);
  if (!t) {
    throw new Error(
      "TransportProvider missing. Wrap your app with the platform's TransportBridge.",
    );
  }
  return t;
}

export function TransportProvider({
  transport,
  children,
}: {
  transport: Transport;
  children: ReactNode;
}) {
  return (
    <TransportContext.Provider value={transport}>
      {children}
    </TransportContext.Provider>
  );
}
