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
 * @param {{ isDev: boolean }} opts
 */
function buildMenu(opts) {
  const isMac = process.platform === "darwin";
  const isDev = opts.isDev;

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
  // Reload / DevTools are dev-only — see commit 3 for the production
  // gating that also blocks F12 + Cmd-Opt-I via webContents key handler.
  template.push({
    label: "View",
    submenu: [
      ...(isDev
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
      ...(isMac
        ? [{ type: "separator" }, { role: "front" }]
        : []),
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
