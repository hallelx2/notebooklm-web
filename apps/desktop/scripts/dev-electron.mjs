#!/usr/bin/env node
/**
 * Launches Electron for `bun run dev:electron`, scrubbing the
 * `ELECTRON_RUN_AS_NODE` env var first.
 *
 * If that var is set anywhere in the parent shell (some Claude Code /
 * agent runtimes inject it, some CI configs leak it from previous
 * steps), Electron silently runs in "plain Node" mode — `process.type`
 * stays `undefined`, `require("electron")` returns the binary path
 * string instead of the API, and `app.isPackaged` (line 180 of
 * main.cjs) crashes during module load with no window ever opening.
 *
 * The desktop README documents this trap, but stepping in a level
 * deeper makes the dev script self-healing — no shell ceremony
 * required from whoever runs `bun run dev`.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "..");

// Resolve the electron binary using the package's own `getElectronPath`
// (returns the path string when required from regular Node — exactly
// what we want here since this wrapper IS regular Node).
const { default: electronBinary } = await import("electron");

// Clone parent env, drop the booby-trap var.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [desktopRoot], {
  stdio: "inherit",
  env,
  windowsHide: false,
});

child.on("close", (code, signal) => {
  if (code === null) {
    console.error(`electron exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    if (!child.killed) child.kill(sig);
  });
}
