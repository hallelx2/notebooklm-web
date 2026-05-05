// CommonJS — Electron's main process is loaded via Node's CJS loader.
// The renderer (Vite output) is ESM and lives separately.
const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("node:path");
const { buildMenu } = require("./menu.cjs");
const { createWindowState } = require("./window-state.cjs");
const { setupAutoUpdater } = require("./updater.cjs");

const isDev = !app.isPackaged;
const DEV_URL = process.env.NOTEBOOKLM_DEV_URL ?? "http://localhost:5173";

// Single-instance lock: if another copy of the app is already running,
// the second invocation receives `false` and exits immediately. The
// running copy gets a `second-instance` event we use to focus its window
// (handled in app.whenReady below). Without this, double-clicking the
// app icon — or in future a `notebooklm://` deep link — would spawn a
// duplicate process holding a second PGlite handle.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  // The require chain above is still resolving when quit() runs; return
  // here so we don't continue evaluating (which would attach more event
  // listeners on a quitting app).
  // biome-ignore lint/correctness/noUnusedExpressions: noop sentinel
  process.exit(0);
}

/**
 * Try to load `url` into `win`. If Vite isn't ready yet (ERR_CONNECTION_REFUSED)
 * or any other transient load failure, retry up to `retries` times with a
 * `delayMs` interval. The wait-on guard in package.json already gates this in
 * the happy path; this is the belt-and-braces fallback for the case where
 * Vite opens its TCP port a beat before it actually serves a response.
 */
async function loadWithRetry(win, url, retries = 30, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await win.loadURL(url);
      return;
    } catch (err) {
      const code = err && (err.code || err.errno);
      const isLastAttempt = i === retries - 1;
      // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
      console.warn(
        `[NotebookLM Desktop] loadURL ${url} failed (${code ?? err}) — ` +
          (isLastAttempt
            ? "giving up"
            : `retry ${i + 1}/${retries} in ${delayMs}ms`),
      );
      if (isLastAttempt) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/**
 * Per-platform native chrome.
 *
 * macOS: frameless titlebar with traffic lights inset over the content +
 *   sidebar vibrancy so the background blends with the OS chrome. Matches
 *   the standard Apple-app feel (Mail, Notes, Xcode).
 *
 * Windows: keep the default frame for now. Win11 mica/acrylic via
 *   `backgroundMaterial: "mica"` needs Electron 35+; we're on 33. Flagged
 *   for a follow-up Electron upgrade in P1.
 *
 * Linux: default frame. GTK/CSD integration is its own story.
 */
function platformWindowOptions() {
  if (process.platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      vibrancy: "sidebar",
      visualEffectState: "active",
    };
  }
  return {};
}

// Brand icon used for the running window (taskbar/dock/Linux WM). The
// installer applies its own packaged icon at install time, but without
// this, dev runs and Linux at runtime show Electron's default icon.
// macOS reads the dock icon from the .icns inside the .app bundle, so
// `BrowserWindow({ icon })` is a no-op there — we still set it for
// parity with `app.dock.setIcon` callers further down the line.
const APP_ICON_PATH = path.join(__dirname, "..", "build", "icon.png");

function createWindow() {
  const state = createWindowState();
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#050505",
    title: "NotebookLM",
    icon: APP_ICON_PATH,
    ...platformWindowOptions(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Loaded before the renderer; exposes `window.notebooklm.onMenuCommand`
      // via contextBridge. See apps/desktop/electron/preload.cjs.
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Hook resize/move/close so the keeper writes window-state.json.
  state.manage(win);

  // External links open in the user's default browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://localhost") || url.startsWith("file://")) {
      return { action: "allow" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    loadWithRetry(win, DEV_URL).catch((err) => {
      // biome-ignore lint/suspicious/noConsole: dev-only diagnostic
      console.error("[NotebookLM Desktop] failed to load dev URL", err);
    });
    win.webContents.openDevTools({ mode: "right" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));

    // Production: block F12 / Cmd-Opt-I / Ctrl-Shift-I so end users can't
    // accidentally pop open devtools. The View > Toggle DevTools menu item
    // is already gated behind isDev (see electron/menu.cjs). We still let
    // Cmd/Ctrl-R reload — that's a useful escape hatch from a stuck UI.
    win.webContents.on("before-input-event", (event, input) => {
      const key = input.key?.toLowerCase();
      const isF12 = key === "f12";
      const isMacShortcut =
        process.platform === "darwin" &&
        input.meta &&
        input.alt &&
        key === "i";
      const isWinLinuxShortcut =
        process.platform !== "darwin" &&
        input.control &&
        input.shift &&
        key === "i";
      if (isF12 || isMacShortcut || isWinLinuxShortcut) {
        event.preventDefault();
      }
    });
  }
}

app.whenReady().then(() => {
  // Install the application menu once. It uses BrowserWindow.getFocusedWindow()
  // at click time so it stays correct across window close/recreate cycles
  // (notably macOS where the app stays alive after window-all-closed).
  buildMenu({ isDev });
  createWindow();

  // Production-only auto-update check via electron-updater. In dev the
  // updater short-circuits because there's no signed installer to
  // diff against. Errors are surfaced to a dialog rather than thrown
  // — a failed update check shouldn't kill the app.
  if (!isDev) {
    setupAutoUpdater({ dialog });
  }
});

// Second-instance handler — runs in the FIRST (still-running) copy when a
// user double-clicks the app icon while it's already open. Find the
// existing window, restore + focus it. The newly-launched copy already
// quit at the top of this file when requestSingleInstanceLock() returned
// false.
app.on("second-instance", () => {
  const wins = BrowserWindow.getAllWindows();
  const win = wins[0];
  if (!win) {
    createWindow();
    return;
  }
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
