/**
 * Types for the contextBridge API exposed by `apps/desktop/electron/preload.cjs`.
 * Declared globally so any renderer file can read `window.notebooklm.*` with
 * full type safety.
 *
 * Optional because the same renderer code runs under `vite preview` /
 * `dev:browser` without Electron, where the bridge is absent.
 */
export {};

declare global {
  interface Window {
    notebooklm?: {
      /**
       * Subscribe to menu commands sent by the Electron main process. The
       * returned function unsubscribes — call it from useEffect cleanup so
       * hot-reload doesn't accumulate listeners.
       */
      onMenuCommand(handler: (cmd: MenuCommand) => void): () => void;
    };
  }

  /** Commands the main-process menu (`apps/desktop/electron/menu.cjs`) emits. */
  type MenuCommand = "new-notebook" | "open-settings";
}
