import { getRequestListener } from "@hono/node-server";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { createApp } from "@notebooklm/server";
import { defineConfig } from "vite";
import { getStubAdapter } from "./src/server/stub-adapter";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // Mount the @notebooklm/server Hono app as Vite middleware. Phase 2
      // moves this into a Tauri sidecar binary; the Hono app itself doesn't
      // change between Phase 1 dev and Phase 2 production.
      name: "notebooklm-server-middleware",
      async configureServer(server) {
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
