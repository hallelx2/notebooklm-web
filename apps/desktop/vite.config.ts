import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
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
        const [serverPkg, stubMod, honoNode] = await Promise.all([
          server.ssrLoadModule("@notebooklm/server"),
          server.ssrLoadModule("/src/server/stub-adapter.ts"),
          server.ssrLoadModule("@hono/node-server"),
        ]);
        const { createApp } = serverPkg as typeof import("@notebooklm/server");
        const { getStubAdapter } = stubMod as typeof import("./src/server/stub-adapter");
        const { getRequestListener } = honoNode as typeof import("@hono/node-server");

        const adapter = await getStubAdapter();
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
