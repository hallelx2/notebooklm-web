"use client";

type Props = {
  open: boolean;
  title: string;
  icon: string;
  onClose: () => void;
};

export function StudioModal({ open, title, icon, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-border-dark shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-2xl text-blue-600">
              {icon}
            </span>
            <h2 className="text-xl font-medium text-gray-800 dark:text-gray-200">
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 overflow-y-auto flex-1">
          <p className="text-sm text-gray-500">
            Output will appear here once sources are added and generation runs.
          </p>
        </div>
      </div>
    </div>
  );
}
