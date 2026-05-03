/**
 * Standardised hero block for each settings section. Matches the headline
 * proportions of the notebooks dashboard (`Your\nNotebooks`).
 */
export function SettingsSection({
  tagline,
  title,
  description,
  children,
}: {
  tagline: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-10 max-w-[1400px] w-full mx-auto px-4 sm:px-6 md:px-10 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 lg:gap-8 pb-6 sm:pb-8 mb-10 border-b border-slate-200 dark:border-white/10">
        <div>
          <div className="flex items-center gap-3 mb-3 sm:mb-4">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
              {tagline}
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-medium tracking-tighter text-slate-900 dark:text-white">
            {title}
          </h1>
        </div>
        <div className="max-w-md lg:text-left">
          <p className="text-slate-500 dark:text-zinc-400 font-light text-base sm:text-lg leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      {children}
    </div>
  );
}
