// CommonJS preload script. Runs in the renderer process under sandbox +
// contextIsolation, with restricted access to Node primitives. We use
// `contextBridge` to expose a typed, narrow API to the renderer
// without leaking `ipcRenderer` directly.
//
// Counterpart types live in `apps/desktop/src/electron-bridge.d.ts`.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notebooklm", {
  /**
   * Subscribe to menu commands sent by the main process via the
   * `notebooklm:menu` IPC channel. The handler receives the command name
   * as a string. Returns an unsubscribe function the renderer should call
   * on unmount to avoid duplicate listeners on hot-reload.
   * @param {(cmd: string) => void} handler
   * @returns {() => void}
   */
  onMenuCommand(handler) {
    /** @type {(_event: unknown, cmd: string) => void} */
    const listener = (_event, cmd) => handler(cmd);
    ipcRenderer.on("notebooklm:menu", listener);
    return () => ipcRenderer.removeListener("notebooklm:menu", listener);
  },
});
