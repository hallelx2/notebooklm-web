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
       * Origin the embedded API server is reachable at. Resolves to
       * `http://127.0.0.1:<port>` in production builds and to the
       * vite dev URL when running under `bun run dev`. The renderer
       * should await this once at boot and pass the result into the
       * trpc client + Better Auth fetch.
       */
      getApiBaseUrl(): Promise<string>;

      /**
       * Subscribe to menu commands sent by the Electron main process. The
       * returned function unsubscribes — call it from useEffect cleanup so
       * hot-reload doesn't accumulate listeners.
       */
      onMenuCommand(handler: (cmd: MenuCommand) => void): () => void;

      /**
       * Subscribe to update-available announcements. The autoUpdater fires
       * this whenever GitHub Releases has a newer version than this build,
       * regardless of whether the signed-update flow can apply. Renderer
       * surfaces a banner with the version + a Download button.
       */
      onUpdateAvailable(
        handler: (info: { version: string; releaseUrl: string }) => void,
      ): () => void;

      /**
       * Open a URL in the user's default external browser via the main
       * process. Used by the update banner so we don't expose
       * `shell.openExternal` directly to the renderer.
       */
      openExternal(url: string): Promise<void>;

      /**
       * Resolves to the on-disk path of `desktop.log`, or null when the
       * file logger couldn't be installed (memory mode or unwritable
       * data dir). Renderer can show this path in an error UI so the
       * user knows where to grab logs from.
       */
      getLogPath(): Promise<string | null>;

      /**
       * Reveal `desktop.log` in the platform file manager. Equivalent
       * to the Help > Show Logs menu item; exposed so renderer-side
       * error surfaces can escalate users to the same file with one
       * click. Resolves true on success, false if the logger isn't up.
       */
      showLog(): Promise<boolean>;
    };
  }

  /** Commands the main-process menu (`apps/desktop/electron/menu.cjs`) emits. */
  type MenuCommand = "new-notebook" | "open-settings";
}
