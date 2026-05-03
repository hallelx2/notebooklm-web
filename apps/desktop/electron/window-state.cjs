// CommonJS — loaded by Electron's main process which is CJS-only.
const { existsSync, mkdirSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");
const windowStateKeeper = require("electron-window-state");

/**
 * Resolve the app's data directory the same way `apps/desktop/src/server/
 * stub-adapter.ts` resolves it (env override + `~/.notebooklm` fallback,
 * with `memory:` short-circuit for ephemeral mode). Keeping the resolution
 * logic identical means PGlite, local-FS storage, the install config, and
 * now the window-state file all live under the same folder.
 *
 * Returns `null` when the user opted into ephemeral mode — callers should
 * fall back to electron-window-state's default location (Electron's
 * `app.getPath('userData')`) so we don't pollute disk in that case.
 */
function resolveDataDir() {
  const env = process.env.NOTEBOOKLM_DATA_DIR;
  if (env === "memory:") return null;
  return env && env.length > 0 ? env : join(homedir(), ".notebooklm");
}

/**
 * Build a window-state keeper. Pass the result's `x/y/width/height` into
 * the BrowserWindow constructor and call `state.manage(win)` AFTER the
 * window is created so the keeper attaches resize/move/close listeners
 * and writes the JSON back at lifecycle events.
 *
 * Defaults match the previous hard-coded values in main.cjs (1440×920)
 * so first-launch behaviour is unchanged.
 */
function createWindowState() {
  /** @type {{ defaultWidth: number; defaultHeight: number; path?: string; file?: string }} */
  const opts = {
    defaultWidth: 1440,
    defaultHeight: 920,
  };
  const dir = resolveDataDir();
  if (dir) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    opts.path = dir;
    opts.file = "window-state.json";
  }
  return windowStateKeeper(opts);
}

module.exports = { createWindowState };
