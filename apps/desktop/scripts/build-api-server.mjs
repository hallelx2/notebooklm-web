// Bundle the embedded Hono server entry into a single CommonJS file
// the Electron main process can `require` at runtime.
//
// Why this exists: the workspace packages (@notebooklm/server,
// @notebooklm/core) export raw TypeScript source via their `exports`
// map. Vite handles that transparently in dev. The packaged Electron
// main process does not — it's plain Node CJS. esbuild does the
// bundling + TS transpilation in one shot.
//
// External list rule of thumb: anything with a native binary or
// platform-specific `.node` addon stays external and is resolved
// against the packaged `node_modules` at runtime. Pure JS modules
// (hono, drizzle-orm, better-auth, ai, the @ai-sdk/* providers) get
// inlined into the bundle.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, "..");
const ENTRY = resolve(APP_ROOT, "electron", "api-server.entry.ts");
const OUTFILE = resolve(APP_ROOT, "dist-electron", "api-server.cjs");

const EXTERNAL = [
  // Electron itself is provided at runtime by the host process.
  "electron",
  "electron-updater",

  // Native + WASM deps — must stay external so the packaged
  // node_modules supplies the platform-specific binaries.
  "@electric-sql/pglite",
  "onnxruntime-node",
  "sharp",

  // Optional / heavy deps used downstream of @notebooklm/core that
  // either pull in native binaries or carry their own model assets.
  // Bundling them would balloon the .cjs and risk dropping platform
  // shims; leaving external means transformers.js + kokoro-js find
  // their normal install layout under node_modules.
  "@huggingface/transformers",
  "kokoro-js",

  // jsdom does a runtime `require.resolve("./xhr-sync-worker.js")`
  // that esbuild can't follow. Bundling would drop the worker file
  // and crash whenever core's HTML ingestion path uses XHR. Leaving
  // jsdom external keeps the worker layout intact under
  // node_modules.
  "jsdom",
];

// biome-ignore lint/suspicious/noConsole: build-time progress log
console.log(`[build-api-server] bundling ${ENTRY} -> ${OUTFILE}`);

await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  outfile: OUTFILE,
  external: EXTERNAL,
  // No sourcemap in production — the linked .map adds ~33 MB to the
  // installer for a feature only useful when actively debugging the
  // main-process bundle. Re-enable locally with NOTEBOOKLM_BUILD_API_SOURCEMAP=1.
  sourcemap:
    process.env.NOTEBOOKLM_BUILD_API_SOURCEMAP === "1" ? "linked" : false,
  // Hono and the @hono/* helpers ship ESM entries; when bundled in
  // CJS mode esbuild needs this hint to resolve their `import` form.
  mainFields: ["module", "main"],
  logLevel: "info",
  // `import.meta.url` references in stub-adapter / searxng-manager
  // sit on a `typeof __dirname !== "undefined" ? __dirname : ...`
  // ternary. In the CJS bundle the fallback branch is dead — Node
  // always defines `__dirname` — so the empty-import-meta warning
  // is purely cosmetic. Silence it; runtime behaviour is correct.
  logOverride: {
    "empty-import-meta": "silent",
  },
});

// biome-ignore lint/suspicious/noConsole: build-time progress log
console.log("[build-api-server] done.");
