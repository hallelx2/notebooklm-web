// CommonJS — Electron's main process is loaded via Node's CJS loader.
// The renderer (Vite output) is ESM and lives separately.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

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

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: "#050505",
    autoHideMenuBar: true,
    title: "NotebookLM",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

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
