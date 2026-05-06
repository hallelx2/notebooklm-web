// CommonJS — Electron's main process is loaded via Node's CJS loader.
// The renderer (Vite output) is ESM and lives separately.
//
// `early-boot.cjs` MUST come first: it loads `<DATA_DIR>/.env` so values
// like NOTEBOOKLM_ENABLE_DEVTOOLS are visible to the module-level
// `const`s below, and it installs a file logger to `<DATA_DIR>/desktop.log`
// so api-server crashes are visible in packaged builds (Windows GUI
// has no console window). Every require past this point inherits the
// updated env and the wrapped console.
const earlyBoot = require("./early-boot.cjs");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  shell,
  utilityProcess,
} = require("electron");
const path = require("node:path");
const { buildMenu } = require("./menu.cjs");
const { createWindowState } = require("./window-state.cjs");
const { setupAutoUpdater } = require("./updater.cjs");

// ─── ML utility-process workers ────────────────────────────────────
//
// onnxruntime-node's `session.run()` returns a Promise but the JS-side
// pre/post-processing in kokoro-js (phonemizer + tokenizer + tensor
// reshaping) and in transformers.js's feature-extraction pipeline
// (tokenizer + mean-pool + normalize) still runs on the same JS event
// loop that pumps Windows IPC and serves renderer fetches. With audio-
// overview generation pinning the loop for ~100 sec/segment — and bulk
// embedding doing similar damage during ingestion — Windows DWM flags
// the BrowserWindow as "Not Responding" and renderer polling stalls.
//
// Fix: each ONNX-bound subsystem (Kokoro TTS, sentence-transformer
// embeddings) runs in its own Electron utility process. The api-server
// reaches them via `globalThis.__notebooklm{Tts,Embed}Rpc` — no
// explicit plumbing through `bindCoreRuntime`, the bundle is
// `require()`d below into the same V8 isolate so the assignment is
// visible the moment the consumer modules evaluate the hook. The
// in-process providers (`packages/core/src/tts/kokoro-local.ts` and
// `packages/core/src/ai/embed/local.ts`) look up the hook at request
// time and route through the worker when present, falling back to
// inline ONNX when it isn't (dev mode, tests, server deployments).
//
// `createWorkerRpc` factories share all the wiring — message
// correlation, timeout, exit / respawn, stdio fold-in to desktop.log.
// Adding a third worker (e.g. reranking) is a one-liner.

/**
 * Spawns and supervises an Electron utility process that speaks the
 * `{ id, type, payload }` ↔ `{ id, ok, result | error }` RPC protocol.
 * Lazy: the child isn't forked until the first call. Self-healing: if
 * the child exits, pending requests reject and the next call respawns.
 *
 * @param {{ name: string; script: string; defaultTimeoutMs?: number }} opts
 */
function createWorkerRpc({ name, script, defaultTimeoutMs = 300_000 }) {
  /** @type {import('electron').UtilityProcess | null} */
  let worker = null;
  const pending = new Map();
  let nextId = 1;

  function ensureWorker() {
    if (worker) return worker;
    const workerPath = path.join(__dirname, script);
    // biome-ignore lint/suspicious/noConsole: main-process diagnostic
    console.log(`[NotebookLM Desktop] forking ${name} at ${workerPath}`);
    worker = utilityProcess.fork(workerPath, [], {
      serviceName: name,
      // Pipe stdio so console.log inside the worker ends up in
      // desktop.log instead of disappearing — utility processes have
      // no attached terminal, so without this their stdout is gone.
      stdio: "pipe",
      // Forward NOTEBOOKLM_BUNDLED_MODELS_DIR / NOTEBOOKLM_MODEL_CACHE_DIR
      // / KOKORO_* so the worker uses the same bundled-model layout
      // the in-process paths would.
      env: { ...process.env },
    });

    worker.on("message", (msg) => {
      if (!msg || typeof msg.id !== "number") return;
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || `${name} rpc failed`));
    });

    worker.on("exit", (code) => {
      // biome-ignore lint/suspicious/noConsole: main-process diagnostic
      console.warn(
        `[NotebookLM Desktop] ${name} exited (code=${code}). Re-spawn on next request.`,
      );
      const oldPending = Array.from(pending.values());
      pending.clear();
      worker = null;
      for (const p of oldPending) {
        p.reject(new Error(`${name} exited with code ${code}`));
      }
    });

    if (worker.stdout) {
      worker.stdout.on("data", (chunk) => {
        const text = chunk.toString().replace(/\s+$/, "");
        if (text) earlyBoot.logFromSource(name, "stdout", text);
      });
    }
    if (worker.stderr) {
      worker.stderr.on("data", (chunk) => {
        const text = chunk.toString().replace(/\s+$/, "");
        if (text) earlyBoot.logFromSource(name, "stderr", text);
      });
    }

    return worker;
  }

  /**
   * Send an RPC message to the worker and resolve with its reply.
   * Spawns the worker on first call. Default 5 min timeout: model
   * load + a single op fits well under that on every CPU we expect
   * users to run on, anything longer means something is wrong and
   * we'd rather error than hang forever.
   */
  function rpc(type, payload, timeoutMs = defaultTimeoutMs) {
    return new Promise((resolve, reject) => {
      const w = ensureWorker();
      const id = nextId++;
      const timer = setTimeout(() => {
        if (pending.delete(id)) {
          reject(new Error(`${name} timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      w.postMessage({ id, type, payload });
    });
  }

  function shutdown() {
    if (worker) {
      try {
        worker.kill();
      } catch (err) {
        // biome-ignore lint/suspicious/noConsole: main-process diagnostic
        console.warn(`[NotebookLM Desktop] ${name} kill failed`, err);
      }
      worker = null;
    }
  }

  return { rpc, shutdown };
}

const ttsWorker = createWorkerRpc({
  name: "tts-worker",
  script: "tts-worker.cjs",
});
const embedWorker = createWorkerRpc({
  name: "embed-worker",
  script: "embed-worker.cjs",
});

// Publish the RPCs to the api-server bundle. Both processes share
// this V8 isolate (the bundle is `require()`d below from
// `startEmbeddedApiServer`), so these assignments are visible the
// moment the bundle's modules evaluate the hook.
globalThis.__notebooklmTtsRpc = ttsWorker.rpc;
globalThis.__notebooklmEmbedRpc = embedWorker.rpc;

const isDev = !app.isPackaged;
const DEV_URL = process.env.NOTEBOOKLM_DEV_URL ?? "http://localhost:5173";

// `isDev` gates auto-load of devtools and disables the menu/keyboard
// blockers. In production builds it's always false, which means a user
// hitting an opaque "fetch failed" / kokoro-load error has no way to see
// what actually happened — the friendly modal hides it. Setting
// NOTEBOOKLM_ENABLE_DEVTOOLS=1 (typically via <DATA_DIR>/.env) flips
// that gate without giving up the rest of the prod build, so support
// can surface the real error and we can iterate. Devtools still
// requires an active key chord; the env var only un-blocks them.
const ENABLE_DEVTOOLS_OVERRIDE =
  process.env.NOTEBOOKLM_ENABLE_DEVTOOLS === "1";
const showDevTools = isDev || ENABLE_DEVTOOLS_OVERRIDE;

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

  // Fold renderer console output into the same desktop.log file the
  // main process writes to. Without this, errors thrown in React are
  // invisible in packaged builds — devtools is gated and the file
  // logger only sees main-side console calls. The arguments to
  // `console-message` are documented at:
  // https://www.electronjs.org/docs/latest/api/web-contents#event-console-message
  win.webContents.on("console-message", (_event, level, message, line, source) => {
    const levelName =
      level === 0 ? "log" : level === 1 ? "warn" : level === 2 ? "error" : "info";
    const where = source ? ` (${source}:${line})` : "";
    earlyBoot.logFromSource("renderer", levelName, `${message}${where}`);
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
    //
    // The block is bypassed when NOTEBOOKLM_ENABLE_DEVTOOLS=1 — the
    // support escape hatch for diagnosing renderer / server issues in
    // a packaged build without shipping a debug-mode installer.
    if (!showDevTools) {
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

// Renderer → main bridge: surface the on-disk log path so the renderer
// can offer a "copy logs" / "show in folder" action when the user
// wants to share a diagnostic. Returns null if early-boot couldn't
// install a logger (memory mode or unwritable data dir).
ipcMain.handle("notebooklm:log-path", () => earlyBoot.logPath);

// Renderer → main bridge: reveal the desktop.log file in the platform
// file manager. Cheaper than streaming the contents through IPC and
// it gives the user the natural "drag this file into the issue
// tracker" affordance. No-ops if the logger never came up.
ipcMain.handle("notebooklm:show-log", () => {
  if (!earlyBoot.logPath) return false;
  shell.showItemInFolder(earlyBoot.logPath);
  return true;
});

// Renderer → main bridge: open a URL in the user's default external
// browser. Used by the in-app update banner's "Download" button to
// send the user to the GitHub release page. Validate the protocol so
// a compromised renderer can't pivot through us into `file://` reads
// or arbitrary `shell.openExternal` payloads.
ipcMain.handle("notebooklm:open-external", async (_event, url) => {
  if (typeof url !== "string") return;
  if (!/^https?:\/\//i.test(url)) {
    // biome-ignore lint/suspicious/noConsole: main-process diagnostic
    console.warn(
      "[NotebookLM Desktop] refusing openExternal — non-http(s) URL:",
      url,
    );
    return;
  }
  await shell.openExternal(url);
});

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
  // `showDevTools` flips the gate that ordinarily hides View > Toggle
  // DevTools in packaged builds — see the env-var doc above. `logPath`
  // is forwarded so the Help menu can offer a "Show Logs" item that
  // reveals desktop.log in the platform file manager.
  buildMenu({ isDev, showDevTools, logPath: earlyBoot.logPath });
  createWindow();

  // Production-only auto-update check via electron-updater. In dev the
  // updater short-circuits because there's no signed installer to
  // diff against. Errors are surfaced to a dialog rather than thrown
  // — a failed update check shouldn't kill the app.
  if (!isDev) {
    setupAutoUpdater({ dialog });
  }
});

// Tear down the embedded server + ML workers on quit. before-quit
// fires once even on macOS Cmd-Q, so it covers every exit path that
// goes through Electron's normal shutdown. Utility processes don't
// auto-die when their parent exits — a leftover ~200 MB Node child
// holding the kokoro model (or the embed pipeline) shouldn't survive
// a clean quit.
app.on("before-quit", async () => {
  if (apiServerHandle) {
    try {
      await apiServerHandle.close();
    } catch (err) {
      // biome-ignore lint/suspicious/noConsole: main-process diagnostic
      console.warn("[NotebookLM Desktop] api server close failed", err);
    }
  }
  ttsWorker.shutdown();
  embedWorker.shutdown();
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
