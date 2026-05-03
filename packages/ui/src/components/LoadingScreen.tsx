/**
 * Full-window loading state shown while the session resolves, the
 * onboarding gate runs its check, or any other blocking pre-render work.
 *
 * Sized to fill the viewport so first paint isn't a blank flash even
 * when the wrapping layout hasn't mounted yet.
 */
export function LoadingScreen({
  message = "Loading…",
  hint,
}: {
  message?: string;
  hint?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-background-light dark:bg-background-dark text-slate-900 dark:text-zinc-100">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-md bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
          <span className="material-symbols-outlined icon-filled text-white text-[20px]">
            book_2
          </span>
        </div>
        <span className="text-base font-medium tracking-tight">NotebookLM</span>
      </div>
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-slate-500 dark:text-zinc-400">
        <span className="material-symbols-outlined text-[14px] animate-spin">
          progress_activity
        </span>
        {message}
      </div>
      {hint ? (
        <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-xs text-center">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
