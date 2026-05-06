// CommonJS preload script. Runs in the renderer process under sandbox +
// contextIsolation, with restricted access to Node primitives. We use
// `contextBridge` to expose a typed, narrow API to the renderer
// without leaking `ipcRenderer` directly.
//
// Counterpart types live in `apps/desktop/src/electron-bridge.d.ts`.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("notebooklm", {
  /**
   * Resolves to the origin the embedded API server is reachable at —
   * `http://127.0.0.1:<port>` in production, the vite dev URL in dev.
   * The renderer awaits this once at boot and uses the value to
   * configure httpBatchLink + Better Auth's fetch base.
   * @returns {Promise<string>}
   */
  getApiBaseUrl() {
    return ipcRenderer.invoke("notebooklm:api-base-url");
  },

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

  /**
   * Subscribe to "update available" announcements from the main-process
   * autoUpdater. Fires whenever GitHub Releases publishes a tag whose
   * version is newer than this build, BEFORE any signature-verified
   * download attempt — which means it works even on unsigned builds
   * where the auto-installer step refuses to apply (current state until
   * Authenticode is configured in CI). The renderer surfaces a banner
   * with a "Download" button that opens the release page.
   * @param {(info: { version: string; releaseUrl: string }) => void} handler
   * @returns {() => void}
   */
  onUpdateAvailable(handler) {
    /** @type {(_event: unknown, info: { version: string; releaseUrl: string }) => void} */
    const listener = (_event, info) => handler(info);
    ipcRenderer.on("notebooklm:update-available", listener);
    return () =>
      ipcRenderer.removeListener("notebooklm:update-available", listener);
  },

  /**
   * Open a URL in the user's default external browser. Used by the
   * update banner's "Download" button to send the user to the GitHub
   * release page without surfacing `shell.openExternal` directly to
   * the renderer.
   * @param {string} url
   */
  openExternal(url) {
    return ipcRenderer.invoke("notebooklm:open-external", url);
  },
});
