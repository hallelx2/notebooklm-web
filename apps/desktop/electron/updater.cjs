/**
 * Auto-update integration via electron-updater.
 *
 * Pull-mechanism: at app launch (and once every 6 hours after) we hit
 * the GitHub Releases atom for `hallelx2/notebooklm-web` and look for
 * an asset whose version is greater than this build. If found, we
 * download in the background and surface a "Restart to update" dialog
 * once the download finishes.
 *
 * What's signed:
 *   - Windows: NSIS installer + latest.yml manifest, signed by
 *     CSC_LINK / CSC_KEY_PASSWORD secrets in the GHA workflow.
 *   - macOS: DMG + latest-mac.yml, notarized via APPLE_ID +
 *     APPLE_APP_SPECIFIC_PASSWORD + APPLE_TEAM_ID.
 *   - Linux: AppImage + latest-linux.yml — appimage-update integration.
 *
 * If signing isn't set up (CI without secrets, dev local builds), the
 * release still uploads but the updater on the client refuses to
 * apply it — that's the security model. Better to fail closed than
 * auto-install an unsigned binary.
 */

const { BrowserWindow } = require("electron");

const RELEASE_URL_BASE =
  "https://github.com/hallelx2/notebooklm-web/releases/tag";

function setupAutoUpdater({ dialog }) {
  // Defer-load: `electron-updater`'s top-level access of `app.getVersion()`
  // crashes when destructured before Electron's main process has fully
  // initialised the `app` global (Electron 33 + bun + dev). Requiring it
  // inside the function is harmless in production and makes the module
  // safe to import unconditionally from main.cjs.
  const { autoUpdater } = require("electron-updater");

  // Quiet mode by default — we do our own dialog UX.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  // Pre-release channel uses GitHub releases marked "prerelease". We
  // default to stable; surfacing a prerelease toggle lives in
  // Settings → Updates (not built yet — TODO).
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("error", (err) => {
    // biome-ignore lint/suspicious/noConsole: surface failures to the dev console
    console.error("[NotebookLM Desktop] auto-update error:", err);
  });

  autoUpdater.on("update-available", (info) => {
    // biome-ignore lint/suspicious/noConsole: visible diagnostic
    console.log(
      `[NotebookLM Desktop] update available: ${info.version} (current ${autoUpdater.currentVersion?.version})`,
    );

    // Tell every renderer about the new version. We fire this BEFORE
    // the autoUpdater attempts to download + apply the update — that
    // way users still get notified even when the auto-installer step
    // refuses (unsigned builds, signature mismatch). Renderer renders
    // a banner with a "Download" button that opens the release page.
    //
    // Why getAllWindows: the BrowserWindow may not exist yet when the
    // initial check fires (5s after launch) on a slow boot. We send
    // to all open windows; the renderer's effect deduplicates by
    // version so re-firing on the 6h interval is a no-op visually.
    const releaseUrl = `${RELEASE_URL_BASE}/v${info.version}`;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue;
      win.webContents.send("notebooklm:update-available", {
        version: info.version,
        releaseUrl,
      });
    }
  });

  autoUpdater.on("update-not-available", () => {
    // biome-ignore lint/suspicious/noConsole: visible diagnostic
    console.log("[NotebookLM Desktop] no update available — running latest.");
  });

  autoUpdater.on("update-downloaded", async (info) => {
    const choice = await dialog.showMessageBox({
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `NotebookLM ${info.version} is ready to install.`,
      detail:
        "The update is downloaded. Restart now to install it, or it'll apply the next time you quit the app.",
    });
    if (choice.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  // Initial check 5s after launch — give the renderer time to settle.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      // biome-ignore lint/suspicious/noConsole: visible diagnostic
      console.warn(
        "[NotebookLM Desktop] initial update check failed:",
        err.message,
      );
    });
  }, 5_000);

  // Recheck every 6 hours so long-running sessions still see new
  // releases without a restart.
  setInterval(
    () => {
      autoUpdater.checkForUpdates().catch(() => {});
    },
    6 * 60 * 60 * 1_000,
  );
}

module.exports = { setupAutoUpdater };
