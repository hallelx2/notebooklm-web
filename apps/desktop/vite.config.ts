import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset URLs so the production build works under Electron's
  // file:// protocol (loadFile points at dist/index.html, then assets
  // resolve relative to that).
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      // Mount the @notebooklm/server Hono app as Vite middleware. Phase 2
      // moves this into a Tauri sidecar binary; the Hono app itself doesn't
      // change between Phase 1 dev and Phase 2 production.
      //
      // We load the workspace deps via server.ssrLoadModule (rather than
      // top-level static imports) so Vite's own TS-aware resolver handles
      // them — Node's ESM resolver, which the Vite config loader falls back
      // to, refuses extensionless `./app` imports inside packages/server.
      name: "notebooklm-server-middleware",
      async configureServer(server) {
        // Spawn the kokoro-tts + sentence-transformer embed workers
        // BEFORE the api-server module evaluates. The kokoro-local /
        // local-embed providers read `globalThis.__notebooklm*Rpc` at
        // request time and route through the worker when present,
        // falling back to inline ONNX when it isn't — and inline ONNX
        // crashes on Kokoro-82M model load on most setups. In packaged
        // builds main.cjs handles this; in dev the api-server lives
        // inside Vite's process so we mirror the wiring here.
        const { installDevWorkers } = await server.ssrLoadModule(
          "/src/server/dev-workers.mjs",
        );
        installDevWorkers();

        const [serverPkg, stubMod, honoNode] = await Promise.all([
          server.ssrLoadModule("@notebooklm/server"),
          server.ssrLoadModule("/src/server/stub-adapter.ts"),
          server.ssrLoadModule("@hono/node-server"),
        ]);
        const { createApp } = serverPkg as typeof import("@notebooklm/server");
        const { getStubAdapter } = stubMod as typeof import("./src/server/stub-adapter");
        const { getRequestListener } = honoNode as typeof import("@hono/node-server");

        // Vite dev origin — the renderer is served from this exact URL
        // and Better Auth needs it in `trustedOrigins` to accept the
        // sign-in POSTs the wizard fires. Phase 2's packaged Electron
        // build passes a `http://127.0.0.1:<port>` URL into the same
        // adapter at runtime; the shape of the call is identical.
        const adapter = await getStubAdapter({
          baseURL: "http://localhost:5173",
        });
        const app = createApp(adapter);
        const handler = getRequestListener(app.fetch);
        server.middlewares.use((req, res, next) => {
          if (!req.url?.startsWith("/api/")) return next();
          handler(req, res);
        });
      },
    },
  ],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
