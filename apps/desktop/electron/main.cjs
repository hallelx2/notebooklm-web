// CommonJS — Electron's main process is loaded via Node's CJS loader.
// The renderer (Vite output) is ESM and lives separately.
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");

const isDev = !app.isPackaged;
const DEV_URL = process.env.NOTEBOOKLM_DEV_URL ?? "http://localhost:5173";

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
      // Same-origin everything in dev — Vite serves the UI and the Hono
      // app on the same port, so cookies, NDJSON, and tRPC just work.
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
    win.loadURL(DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
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
