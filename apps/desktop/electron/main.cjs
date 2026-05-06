// CommonJS — Electron's main process is loaded via Node's CJS loader.
// The renderer (Vite output) is ESM and lives separately.
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const { buildMenu } = require("./menu.cjs");
const { createWindowState } = require("./window-state.cjs");
const { setupAutoUpdater } = require("./updater.cjs");

const isDev = !app.isPackaged;
const DEV_URL = process.env.NOTEBOOKLM_DEV_URL ?? "http://localhost:5173";

/**
 * Origin the renderer should target for `/api/*` calls. Set once
 * `startApiServer()` resolves below; the renderer reads this via
 * `ipcMain.handle('notebooklm:api-base-url')` from the preload
 * script before constructing the trpc/auth clients.
 *
 * In dev the bundle isn't started — vite's middleware mode mounts
 * the same Hono app on the dev URL — so we fall back to `DEV_URL`
 * and the renderer sees the same string either way.
 */
let apiBaseUrl = DEV_URL;
let apiServerHandle = null;

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
    // Load the renderer from the embedded API server so renderer + API
    // share an origin. Previously we used `loadFile(dist/index.html)`,
    // which put the renderer on `file://` while the API ran on
    // `http://127.0.0.1:<port>` — those are cross-site, and Chromium
    // silently drops `SameSite=Lax` Set-Cookie responses across that
    // boundary. The session cookie never persisted and sign-in looked
    // like it succeeded but the next get-session returned null.
    //
    // The Hono app now mounts `serveStatic` for the dist/ folder, so
    // `loadURL(apiBaseUrl)` serves the same `index.html` over http
    // without any cross-origin gymnastics. CSRF, trustedOrigins,
    // cookies all behave exactly like they would on apps/web.
    //
    // Fallback: if the embedded server failed to start, `apiServerHandle`
    // is null and the user has already seen the error dialog from
    // `startEmbeddedApiServer`. Drop back to `loadFile` so the window
    // still opens — sign-in won't work, but at least they see something
    // instead of a blank screen pointed at a dead URL.
    if (apiServerHandle) {
      loadWithRetry(win, apiBaseUrl).catch((err) => {
        // biome-ignore lint/suspicious/noConsole: main-process diagnostic
        console.error(
          "[NotebookLM Desktop] failed to load embedded server URL",
          err,
        );
      });
    } else {
      win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    }

    // Production: block F12 / Cmd-Opt-I / Ctrl-Shift-I so end users can't
    // accidentally pop open devtools. The View > Toggle DevTools menu item
    // is already gated behind isDev (see electron/menu.cjs). We still let
    // Cmd/Ctrl-R reload — that's a useful escape hatch from a stuck UI.
    win.webContents.on("before-input-event", (event, input) => {
      const key = input.key?.toLowerCase();
      const isF12 = key === "f12";
      const isMacShortcut =
        process.platform === "darwin" && input.meta && input.alt && key === "i";
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

/**
 * Boot the embedded Hono server in production builds.
 *
 * Loads `dist-electron/api-server.cjs` (built by esbuild — see
 * `apps/desktop/scripts/build-api-server.mjs`). The bundle exports
 * `startApiServer()` which binds to a random localhost port, builds
 * the desktop adapter (PGlite + Better Auth + storage), and returns
 * `{ url, close }`.
 *
 * In dev we skip this entirely — vite's middleware mode mounts the
 * same Hono app on the dev URL.
 *
 * If the boot throws (corrupt PGlite, port refused, ...) we surface
 * the error in a dialog instead of leaving the user staring at the
 * sign-up form's eternal "Creating..." spinner.
 */
async function startEmbeddedApiServer() {
  if (isDev) return;
  // The bundle sits next to main.cjs after electron-builder packs the
  // app — both end up under `app.asar/electron/` and `app.asar/dist-
  // electron/` respectively.
  // biome-ignore lint/correctness/noNodejsModules: main process is Node
  const bundlePath = path.join(
    __dirname,
    "..",
    "dist-electron",
    "api-server.cjs",
  );
  let mod;
  try {
    mod = require(bundlePath);
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: main-process diagnostic
    console.error(
      "[NotebookLM Desktop] failed to load api-server bundle from",
      bundlePath,
      err,
    );
    dialog.showErrorBox(
      "NotebookLM couldn't start",
      `The local API server bundle failed to load:\n\n${err.message ?? err}\n\nThis is a packaging bug — please reinstall.`,
    );
    throw err;
  }

  try {
    apiServerHandle = await mod.startApiServer();
    apiBaseUrl = apiServerHandle.url;
    // biome-ignore lint/suspicious/noConsole: main-process diagnostic
    console.log(`[NotebookLM Desktop] api server listening at ${apiBaseUrl}`);
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: main-process diagnostic
    console.error("[NotebookLM Desktop] api server failed to start", err);
    dialog.showErrorBox(
      "NotebookLM couldn't start",
      `The local API server crashed during startup:\n\n${err.message ?? err}\n\nThe app will continue to open but sign-in and notebooks won't work until this is fixed.`,
    );
    throw err;
  }
}

// Renderer → main bridge: preload script invokes this to learn what
// origin to point httpBatchLink + Better Auth at. Resolves to the
// dev URL in dev and to the embedded server's URL in production.
ipcMain.handle("notebooklm:api-base-url", () => apiBaseUrl);

app.whenReady().then(async () => {
  // Boot the API server BEFORE the window. The renderer's first
  // fetches (auth session check, trpc.aiConfig.get) fire as soon as
  // it mounts; if the server isn't up by then they'll race and the
  // user sees stuck loading states.
  try {
    await startEmbeddedApiServer();
  } catch {
    // Already shown via dialog. Continue so the window opens — at
    // least the menu/quit shortcuts work, and the user can see the
    // error rather than a hung-and-unkillable Electron shell.
  }

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

// Tear down the embedded server on quit so the http listener and
// PGlite handle release cleanly. before-quit fires once even when the
// user uses Cmd-Q on macOS, so it covers every exit path that goes
// through Electron's normal shutdown.
app.on("before-quit", async () => {
  if (apiServerHandle) {
    try {
      await apiServerHandle.close();
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: main-process diagnostic
      console.warn("[NotebookLM Desktop] api server close failed", err);
    }
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
