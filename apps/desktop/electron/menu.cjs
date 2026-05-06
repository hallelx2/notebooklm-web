// CommonJS — runs in Electron's main process.
const { Menu, BrowserWindow, app, shell, dialog } = require("electron");

const REPO_URL = "https://github.com/anthropics/notebooklm-web";

/**
 * Build and install the application menu. Called once after `app.whenReady()`.
 *
 * The menu sends user-driven actions to the renderer via IPC over the
 * `notebooklm:menu` channel. The renderer subscribes via the preload bridge
 * (`apps/desktop/electron/preload.cjs`), which exposes
 * `window.notebooklm.onMenuCommand(cb)`.
 *
 * Why IPC: the menu lives in the main process, but routing decisions ("go
 * to /settings/profile") belong in the renderer where TanStack Router lives.
 * Sending a typed command lets the renderer translate it into whatever
 * navigation / state change the UI needs without leaking ipcRenderer.
 *
 * @param {{ isDev: boolean; showDevTools?: boolean; logPath?: string | null }} opts
 */
function buildMenu(opts) {
  const isMac = process.platform === "darwin";
  const isDev = opts.isDev;
  // `showDevTools` is a superset of `isDev`. In dev builds it's always
  // true; in packaged builds the env-var override
  // (NOTEBOOKLM_ENABLE_DEVTOOLS=1) flips it on for support diagnosis.
  const showDevTools = !!opts.showDevTools || isDev;
  const logPath = opts.logPath || null;

  /** Resolve the active window at click time so we don't capture a stale ref. */
  const send = (cmd) => {
    const w =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (!w || w.isDestroyed()) return;
    w.webContents.send("notebooklm:menu", cmd);
  };

  /** @type {import("electron").MenuItemConstructorOptions[]} */
  const template = [];

  // ── App menu (macOS only) ────────────────────────────────────────
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: "Settings...",
          accelerator: "Cmd+,",
          click: () => send("open-settings"),
        },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  // ── File menu ────────────────────────────────────────────────────
  template.push({
    label: "File",
    submenu: [
      {
        label: "New Notebook",
        accelerator: "CmdOrCtrl+N",
        click: () => send("new-notebook"),
      },
      ...(isMac
        ? []
        : [
            { type: "separator" },
            {
              label: "Settings",
              accelerator: "CmdOrCtrl+,",
              click: () => send("open-settings"),
            },
            { type: "separator" },
            { role: "quit" },
          ]),
    ],
  });

  // ── Edit menu (standard roles handle Cmd-Z / -X / -C / -V / -A) ──
  template.push({
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      ...(isMac
        ? [
            { role: "pasteAndMatchStyle" },
            { role: "delete" },
            { role: "selectAll" },
            { type: "separator" },
            {
              label: "Speech",
              submenu: [{ role: "startSpeaking" }, { role: "stopSpeaking" }],
            },
          ]
        : [{ role: "delete" }, { type: "separator" }, { role: "selectAll" }]),
    ],
  });

  // ── View menu ────────────────────────────────────────────────────
  // Reload / DevTools default to dev-only — packaged builds also block
  // F12 + Cmd-Opt-I via the webContents key handler. The env-var override
  // (NOTEBOOKLM_ENABLE_DEVTOOLS=1) is the support escape hatch: it flips
  // both the menu item and the keyboard blocker on without changing the
  // rest of the prod build.
  template.push({
    label: "View",
    submenu: [
      ...(showDevTools
        ? [
            { role: "reload" },
            { role: "forceReload" },
            { role: "toggleDevTools" },
            { type: "separator" },
          ]
        : []),
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  });

  // ── Window menu ──────────────────────────────────────────────────
  template.push({
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "close" },
      ...(isMac ? [{ type: "separator" }, { role: "front" }] : []),
    ],
  });

  // ── Help menu ────────────────────────────────────────────────────
  template.push({
    role: "help",
    submenu: [
      {
        label: "Documentation",
        click: () => shell.openExternal(REPO_URL),
      },
      // "Show Logs" reveals desktop.log in the platform file manager.
      // Visible in every build because the primary use-case is users
      // sharing logs with us — exactly when devtools is unavailable.
      ...(logPath
        ? [
            { type: "separator" },
            {
              label: "Show Logs",
              click: () => shell.showItemInFolder(logPath),
            },
          ]
        : []),
      ...(isMac
        ? []
        : [
            { type: "separator" },
            {
              label: "About",
              click: () => {
                const w = BrowserWindow.getFocusedWindow() ?? undefined;
                dialog.showMessageBox(w, {
                  type: "info",
                  title: "About NotebookLM",
                  message: app.name,
                  detail: `Version ${app.getVersion()}\n\nOpen-source NotebookLM clone with BYOK AI providers.`,
                  buttons: ["OK"],
                });
              },
            },
          ]),
    ],
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu };
