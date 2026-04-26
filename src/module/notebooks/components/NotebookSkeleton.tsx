/**
 * Loading-state placeholders for the notebooks dashboard.
 *
 * Two variants matching the two view modes the user can pick:
 *   - {@link NotebookCardSkeleton}  for the grid view (mirrors NotebookCard)
 *   - {@link NotebookRowSkeleton}   for the list view
 *
 * Both share a shimmer animation driven by the `shimmer` keyframe already
 * defined in globals.css (translateX(-100%) → translateX(400%)) and overlaid
 * on top of solid neutral blocks so we keep the dashboard's sharp-cornered
 * aesthetic without rounded skeleton bubbles.
 */

const SHIMMER_OVERLAY =
  "before:content-[''] before:absolute before:inset-0 before:-translate-x-full before:bg-gradient-to-r before:from-transparent before:via-white/40 dark:before:via-white/10 before:to-transparent before:animate-[shimmer_1.6s_infinite]";

function Bar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`relative overflow-hidden bg-slate-200/80 dark:bg-white/[0.06] ${SHIMMER_OVERLAY} ${className}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Grid card                                                          */
/* ------------------------------------------------------------------ */

export function NotebookCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="relative bg-white dark:bg-[#0a0a0a] border border-slate-200 dark:border-white/10 p-5 sm:p-6 flex flex-col gap-4 sm:gap-5 overflow-hidden"
    >
      {/* Title row */}
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Bar className="block h-5 w-3/4" />
          <Bar className="block h-3 w-1/2" />
          <div className="flex items-center gap-2 mt-1">
            <Bar className="block h-3 w-16" />
            <span className="w-1 h-1 bg-slate-300 dark:bg-zinc-700 rounded-full" />
            <Bar className="block h-3 w-20" />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="px-2.5 py-1 rounded-sm flex items-center gap-1.5 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-700" />
            <Bar className="block h-2 w-10" />
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2 min-h-[2.4em]">
        <Bar className="block h-3 w-full" />
        <Bar className="block h-3 w-5/6" />
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-1 py-2 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-1">
            {i > 0 && (
              <div className="w-3 h-[1px] bg-slate-200 dark:bg-white/10" />
            )}
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.03] rounded-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-zinc-700" />
              <Bar className="block h-2 w-10" />
            </div>
          </div>
        ))}
      </div>

      {/* Tag chips + open arrow */}
      <div className="flex flex-wrap gap-2 mt-auto">
        <Bar className="block h-5 w-16" />
        <Bar className="block h-5 w-20" />
        <Bar className="block h-3 w-12 ml-auto" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  List row                                                            */
/* ------------------------------------------------------------------ */

export function NotebookRowSkeleton() {
  return (
    <div aria-hidden="true" className="flex items-center gap-6 p-5 relative">
      <div className="w-10 h-10 rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center">
        <span className="material-symbols-outlined text-slate-300 dark:text-zinc-700 text-lg">
          book_2
        </span>
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        <Bar className="block h-4 w-1/3" />
        <Bar className="block h-3 w-2/3" />
      </div>
      <Bar className="block h-3 w-16 shrink-0" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers to render a full grid / list of skeletons                   */
/* ------------------------------------------------------------------ */

export function NotebookGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton list is fixed-length and never reorders
        <NotebookCardSkeleton key={`grid-${i}`} />
      ))}
    </div>
  );
}

export function NotebookListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-200 dark:divide-white/5 border border-slate-200 dark:border-white/10">
      {Array.from({ length: count }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: skeleton list is fixed-length and never reorders
        <NotebookRowSkeleton key={`row-${i}`} />
      ))}
    </div>
  );
}
