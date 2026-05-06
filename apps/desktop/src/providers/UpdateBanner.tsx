import { useEffect, useState } from "react";

/**
 * Sticky banner that surfaces "v0.1.X is available" the moment
 * electron-updater fires `update-available` in the main process.
 *
 * Why this exists: until Authenticode signing is configured, the
 * silent auto-install path can't apply updates on Windows — the
 * signed-update verification fails and the only signal is an `error`
 * event into the disabled devtools console. Users were left manually
 * polling GitHub Releases. This banner makes the "new version" signal
 * user-visible even when auto-install can't.
 *
 * Behaviour:
 *   - Hidden on first paint (no version known yet).
 *   - On `update-available` IPC: shows the banner with the version
 *     and a "Download" button that opens the release page in the
 *     user's default browser via `shell.openExternal`.
 *   - Dismiss is per-version (sessionStorage) — re-renders on a new
 *     version even if the user dismissed an earlier one.
 *   - The 6h re-check loop (electron-updater) re-fires the event,
 *     but the dedup-by-version keeps the UI stable.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<{
    version: string;
    releaseUrl: string;
  } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const bridge = window.notebooklm;
    if (!bridge?.onUpdateAvailable) return;
    return bridge.onUpdateAvailable((next) => {
      const dismissedKey = `update-banner-dismissed:${next.version}`;
      if (sessionStorage.getItem(dismissedKey) === "1") return;
      setInfo(next);
      setDismissed(false);
    });
  }, []);

  if (!info || dismissed) return null;

  const onDownload = () => {
    window.notebooklm?.openExternal?.(info.releaseUrl);
  };
  const onDismiss = () => {
    sessionStorage.setItem(`update-banner-dismissed:${info.version}`, "1");
    setDismissed(true);
  };

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-3 px-4 py-2 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 text-sm">
      <span className="material-symbols-outlined text-base">
        rocket_launch
      </span>
      <span>
        Version <span className="font-semibold">{info.version}</span> is
        available.
      </span>
      <button
        type="button"
        onClick={onDownload}
        className="px-3 py-1 rounded-full bg-white/15 hover:bg-white/25 transition-colors text-xs font-medium"
      >
        Download
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss update notification"
        className="p-1 rounded-full hover:bg-white/15 transition-colors"
      >
        <span className="material-symbols-outlined text-base">close</span>
      </button>
    </div>
  );
}
