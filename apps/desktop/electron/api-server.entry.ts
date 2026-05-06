// Bundled by `apps/desktop/scripts/build-api-server.mjs` into
// `apps/desktop/dist-electron/api-server.cjs`. The Electron main
// process (CommonJS) requires that bundle and calls `startApiServer`
// before opening the BrowserWindow.
//
// Why a separate bundle: the workspace packages (@notebooklm/server,
// @notebooklm/core) ship raw `.ts` source via their `exports` map.
// Electron's main process can't `require("@notebooklm/server")`
// directly — Node has no TS loader. esbuild bundles + transpiles the
// TS to a single self-contained `.cjs` file that the main process
// can require with no runtime dependencies on the workspace tree.
//
// What stays external: native modules (`@electric-sql/pglite`,
// `onnxruntime-node`, `sharp`) and Electron itself. Those have to be
// resolved at runtime against the packaged node_modules.

import { createServer, type Server } from "node:http";
import { getRequestListener } from "@hono/node-server";
import { createApp } from "@notebooklm/server/app";
import { getStubAdapter } from "../src/server/stub-adapter";

export type StartApiServerResult = {
  /** Origin the renderer should target — `http://127.0.0.1:<port>`. */
  url: string;
  /** Stops the underlying HTTP server. Awaitable. */
  close: () => Promise<void>;
};

/**
 * Boot the embedded Hono server on a random localhost port and return
 * the URL the renderer should fetch against.
 *
 * The bind happens before the adapter is built so we can pass the
 * actual URL into Better Auth (it stamps cookies + checks
 * trustedOrigins against this exact origin). During the brief window
 * between `listen` and the adapter being ready, requests get a
 * 503/Retry-After response — the renderer hasn't loaded yet so this
 * is informational only, not user-visible.
 */
export async function startApiServer(): Promise<StartApiServerResult> {
  const server: Server = createServer((_req, res) => {
    res.statusCode = 503;
    res.setHeader("retry-after", "1");
    res.end("notebooklm api server still starting");
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (err: Error) => {
      server.removeListener("listening", onListen);
      reject(err);
    };
    const onListen = () => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListen);
    server.listen(0, "127.0.0.1");
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") {
    server.close();
    throw new Error("expected a TCP address from the api server listen() call");
  }
  const url = `http://127.0.0.1:${addr.port}`;

  // The stub adapter currently builds Better Auth with a hardcoded
  // `http://localhost:5173`. The next commit threads `baseURL` through
  // so it matches the actual port we just bound; for now this
  // bootstrap is wired up but the auth handshake still references the
  // dev origin.
  const adapter = await getStubAdapter();
  const app = createApp(adapter);

  // Swap the placeholder handler for the real one. We keep the same
  // server instance so the port stays stable and we don't race
  // anything trying to claim the freshly-released port.
  server.removeAllListeners("request");
  server.on("request", getRequestListener(app.fetch));

  return {
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
