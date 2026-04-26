"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";

type Props = {
  open: boolean;
  onClose: () => void;
  notebookId: string;
};

const QUESTION_COUNTS = [5, 10, 15, 20, 25] as const;

export function QuizConfigModal({ open, onClose, notebookId }: Props) {
  const [questionCount, setQuestionCount] = useState(10);
  const utils = trpc.useUtils();

  const generate = trpc.studio.generate.useMutation({
    onSuccess: () => {
      utils.studio.list.invalidate({ notebookId });
      onClose();
    },
  });

  if (!open) return null;

  const isLoading = generate.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={onClose}
        disabled={isLoading}
      />

      <div className="relative w-full max-w-md bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
        {/* Gradient accent bar */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-orange-400 via-amber-500 to-yellow-500" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-500/25">
              <span className="material-symbols-outlined text-xl text-white icon-filled">
                quiz
              </span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                Quiz
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Test your knowledge
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 space-y-5">
          {/* Question count selector */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
              Number of questions
            </label>
            <div className="flex gap-2">
              {QUESTION_COUNTS.map((count) => (
                <button
                  key={count}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setQuestionCount(count)}
                  className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                    questionCount === count
                      ? "bg-orange-50 dark:bg-orange-500/15 border-orange-300 dark:border-orange-500/40 text-orange-700 dark:text-orange-300 shadow-sm"
                      : "bg-element-light dark:bg-element-dark border-border-light dark:border-border-dark text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Error message */}
          {generate.isError && (
            <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <span className="material-symbols-outlined text-lg">error</span>
              {generate.error?.message ||
                "An error occurred during generation."}
            </div>
          )}

          {/* Generate button */}
          <button
            type="button"
            disabled={isLoading}
            onClick={() =>
              generate.mutate({
                notebookId,
                kind: "quiz",
                questionCount,
              })
            }
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-semibold transition-all shadow-md shadow-orange-500/25 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <span className="material-symbols-outlined text-lg animate-spin">
                  progress_activity
                </span>
                Generating...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">
                  auto_awesome
                </span>
                Generate Quiz
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
