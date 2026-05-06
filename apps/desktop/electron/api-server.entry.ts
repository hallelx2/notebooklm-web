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
import { resolve } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
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

  // Pass the just-bound URL into the adapter so Better Auth signs
  // cookies for the right origin and `trustedOrigins` lets sign-in
  // requests through. Without this every auth POST would 403 with
  // an origin-mismatch.
  const adapter = await getStubAdapter({ baseURL: url });
  const app = createApp(adapter);

  // Serve the renderer's static dist/ folder from the same origin as
  // the API. Without this the renderer loaded via `loadFile()` runs
  // on `file://`, which is cross-site to `http://127.0.0.1:<port>`.
  // Chromium silently drops `SameSite=Lax` cookies set by a cross-
  // site response, so the session cookie never persists and the user
  // looks signed out the moment the post-sign-in `get-session` GET
  // fires. Loading the renderer from this same server makes every
  // fetch same-origin and the default cookie attributes Just Work.
  //
  // Path math: in the packaged build this entry compiles to
  // `app.asar/dist-electron/api-server.cjs`, so `__dirname` is
  // `app.asar/dist-electron` and the renderer bundle sits one
  // directory up at `app.asar/dist`.
  //
  // Mounted AFTER `createApp` so the `/api/*` handlers always win
  // route resolution; serveStatic only fires for unmatched paths.
  const distRoot = resolve(__dirname, "..", "dist");
  app.use("/*", serveStatic({ root: distRoot }));

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
