"use client";

import { useState } from "react";
import { trpc } from "../../trpc/client";

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
 className="absolute inset-0 bg-canvas/60 backdrop-blur-sm"
 onClick={onClose}
 disabled={isLoading}
 />

 <div className="relative w-full max-w-md bg-surface dark:bg-surface rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border-subtle/50 dark:border-border-strong/50">
 {/* Gradient accent bar */}
 <div className="absolute inset-x-0 top-0 h-[3px] bg-[var(--ds-accent-gradient)]" />

 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 shrink-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/25">
 <span className="material-symbols-outlined text-xl text-white icon-filled">
 quiz
 </span>
 </div>
 <div>
 <h2 className="text-lg font-semibold text-fg-secondary dark:text-fg">
 Quiz
 </h2>
 <p className="text-xs text-fg-muted">
 Test your knowledge
 </p>
 </div>
 </div>
 <button
 type="button"
 onClick={onClose}
 disabled={isLoading}
 className="p-2 rounded-full hover:bg-accent-soft dark:hover:bg-border-strong text-fg-muted hover:text-fg-secondary dark:hover:text-fg-secondary transition-colors"
 >
 <span className="material-symbols-outlined">close</span>
 </button>
 </div>

 {/* Body */}
 <div className="px-6 pb-6 space-y-5">
 {/* Question count selector */}
 <div>
 <label className="text-sm font-medium text-fg-secondary dark:text-fg-secondary mb-2 block">
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
 : "bg-elevated dark:bg-elevated border-border-subtle dark:border-border-subtle text-fg-secondary dark:text-fg-muted hover:bg-accent-soft dark:hover:bg-border-strong"
 }`}
 >
 {count}
 </button>
 ))}
 </div>
 </div>

 {/* Error message */}
 {generate.isError && (
 <div className="flex items-center gap-2 text-sm text-danger">
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
 className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-all shadow-md shadow-accent/25 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
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
