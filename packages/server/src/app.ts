import { trpcServer } from "@hono/trpc-server";
// Side-effect import: registers every adapter with the agent harness so
// `runAgent({ kind, ... }, [{ id: "ai-sdk" }], ctx)` resolves before any
// handler invokes it. Both apps mount this app, so adding the import here
// covers web (apps/web) and desktop (apps/desktop) without per-app wiring.
import "@notebooklm/core/agent/runtimes";
import { Hono } from "hono";
import type { PlatformAdapter } from "./adapter";
import { adminMigrateHandler } from "./handlers/admin/migrate";
import { chatHandler } from "./handlers/chat";
import { deepResearchHandler } from "./handlers/deep-research";
import { filesHandler } from "./handlers/files";
import { reembedHandler } from "./handlers/reembed";
import { audioOverviewHandler } from "./handlers/studio/audio-overview";
import { quizSummaryHandler } from "./handlers/studio/quiz-summary";
import { uploadHandler } from "./handlers/upload";
import { appRouter, createContext } from "./trpc";

/**
 * Build the framework-agnostic Hono application that owns every server-side
 * concern (Better Auth mount, tRPC mount, streaming routes). Both apps mount
 * this app:
 *   - apps/web: behind a Next.js catch-all route at `/api/[[...path]]/route.ts`
 *   - apps/desktop: behind Vite's middleware mode (Phase 1) or a Tauri sidecar
 *     running `serve({ fetch: app.fetch })` (Phase 2)
 *
 * The adapter argument carries every platform-specific dependency: the
 * Drizzle client, the Better Auth instance, the storage provider, env values.
 */
export function createApp(adapter: PlatformAdapter) {
  type Vars = { adapter: PlatformAdapter };
  const app = new Hono<{ Variables: Vars }>();

  // Make the adapter available to every downstream handler via c.var.adapter.
  app.use("*", async (c, next) => {
    c.set("adapter", adapter);
    await next();
  });

  // Better Auth: every request to /api/auth/* is delegated to the auth
  // instance's web-fetch handler. Cookies, OAuth callbacks, sign-in,
  // sign-up — all handled by Better Auth.
  app.on(["GET", "POST"], "/api/auth/*", (c) =>
    c.var.adapter.auth.handler(c.req.raw),
  );

  // tRPC: mounted via @hono/trpc-server. createContext receives the raw
  // Request and the adapter, fetches the session, returns ctx.
  app.use(
    "/api/trpc/*",
    trpcServer({
      router: appRouter,
      endpoint: "/api/trpc",
      createContext: async (_opts, c) => {
        return createContext({
          request: c.req.raw,
          adapter: c.var.adapter,
        });
      },
    }),
  );

  // Streaming chat handler. Returns AI SDK's UIMessageStreamResponse.
  app.post("/api/chat", (c) => chatHandler(c.req.raw, c.var.adapter));

  // Other streaming and one-shot handlers.
  app.post("/api/deep-research", (c) =>
    deepResearchHandler(c.req.raw, c.var.adapter),
  );
  app.post("/api/upload", (c) => uploadHandler(c.req.raw, c.var.adapter));
  app.post("/api/reembed", (c) => reembedHandler(c.req.raw, c.var.adapter));
  app.post("/api/studio/audio-overview", (c) =>
    audioOverviewHandler(c.req.raw, c.var.adapter),
  );
  app.post("/api/studio/quiz-summary", (c) =>
    quizSummaryHandler(c.req.raw, c.var.adapter),
  );
  app.post("/api/admin/migrate", (c) =>
    adminMigrateHandler(c.req.raw, c.var.adapter),
  );
  app.get("/api/files/*", (c) => filesHandler(c.req.raw, c.var.adapter));

  return app;
}

export type App = ReturnType<typeof createApp>;
