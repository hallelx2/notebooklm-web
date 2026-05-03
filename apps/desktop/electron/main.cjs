// CommonJS — Electron's main process is loaded via Node's CJS loader.
// The renderer (Vite output) is ESM and lives separately.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const { createWindowState } = require("./window-state");

const isDev = !app.isPackaged;
const DEV_URL = process.env.NOTEBOOKLM_DEV_URL ?? "http://localhost:5173";

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
    ...platformWindowOptions(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
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
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
