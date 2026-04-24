"use client";

import { useState } from "react";
import { trpc } from "@/trpc/client";
import { StudioOutputView } from "./StudioOutputView";
import { AudioOverviewModal } from "./AudioOverviewModal";
import { QuizConfigModal } from "./QuizConfigModal";

type StudioOutput = {
  id: string;
  notebookId: string;
  kind: string;
  title: string;
  content: unknown;
  assetUrl: string | null;
  status: string;
  createdAt: Date | string;
};

const STUDIO_TOOLS: {
  kind: string;
  label: string;
  icon: string;
  description: string;
  color: string;
}[] = [
  {
    kind: "study-guide",
    label: "Study guide",
    icon: "menu_book",
    description: "Key topics & review",
    color: "text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/15",
  },
  {
    kind: "briefing-doc",
    label: "Briefing doc",
    icon: "description",
    description: "Executive summary",
    color:
      "text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/15",
  },
  {
    kind: "faq",
    label: "FAQ",
    icon: "help",
    description: "Common questions",
    color:
      "text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-500/15",
  },
  {
    kind: "timeline",
    label: "Timeline",
    icon: "timeline",
    description: "Chronological events",
    color: "text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-500/15",
  },
  {
    kind: "mind-map",
    label: "Mind map",
    icon: "account_tree",
    description: "Visual concept map",
    color:
      "text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/15",
  },
  {
    kind: "flashcards",
    label: "Flashcards",
    icon: "style",
    description: "Study cards",
    color: "text-pink-600 dark:text-pink-400 bg-pink-100 dark:bg-pink-500/15",
  },
  {
    kind: "quiz",
    label: "Quiz",
    icon: "quiz",
    description: "Test knowledge",
    color:
      "text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/15",
  },
];

const KIND_ICONS: Record<string, string> = {
  "audio-overview": "graphic_eq",
  "study-guide": "menu_book",
  "briefing-doc": "description",
  faq: "help",
  timeline: "timeline",
  "mind-map": "account_tree",
  flashcards: "style",
  quiz: "quiz",
};

const KIND_LABELS: Record<string, string> = {
  "audio-overview": "Audio Overview",
  "study-guide": "Study Guide",
  "briefing-doc": "Briefing Doc",
  faq: "FAQ",
  timeline: "Timeline",
  "mind-map": "Mind Map",
  flashcards: "Flashcards",
  quiz: "Quiz",
};

const KIND_BADGE_COLORS: Record<string, string> = {
  "audio-overview":
    "bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400",
  "study-guide":
    "bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "briefing-doc":
    "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  faq: "bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400",
  timeline:
    "bg-cyan-100 dark:bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
  "mind-map":
    "bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
  flashcards:
    "bg-pink-100 dark:bg-pink-500/15 text-pink-600 dark:text-pink-400",
  quiz: "bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400",
};

function formatRelativeDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function StudioPanel({
  notebookId,
  onMindmapNodeClick,
}: {
  notebookId: string;
  onMindmapNodeClick?: (nodeText: string) => void;
}) {
  const utils = trpc.useUtils();
  const [generatingKind, setGeneratingKind] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<StudioOutput | null>(
    null,
  );
  const [audioModalOpen, setAudioModalOpen] = useState(false);
  const [quizModalOpen, setQuizModalOpen] = useState(false);

  const hasGenerating = generatingKind !== null;
  const listQ = trpc.studio.list.useQuery(
    { notebookId },
    { refetchInterval: hasGenerating ? 2000 : false },
  );
  const outputs = (listQ.data ?? []) as StudioOutput[];

  const generate = trpc.studio.generate.useMutation({
    onSuccess: () => {
      setGeneratingKind(null);
      utils.studio.list.invalidate({ notebookId });
    },
    onError: () => {
      setGeneratingKind(null);
    },
  });

  const deleteMut = trpc.studio.delete.useMutation({
    onSuccess: () => {
      utils.studio.list.invalidate({ notebookId });
      setSelectedOutput(null);
    },
  });

  function handleGenerate(kind: string) {
    setGeneratingKind(kind);
    generate.mutate({ notebookId, kind });
  }

  function handleDelete(id: string) {
    deleteMut.mutate({ id });
  }

  // ─── Detail View ──────────────────────────────────────────────────
  if (selectedOutput) {
    const badgeColor =
      KIND_BADGE_COLORS[selectedOutput.kind] ??
      "bg-gray-100 dark:bg-gray-500/15 text-gray-600 dark:text-gray-400";
    return (
      <>
        <div className="p-3 border-b border-border-light dark:border-border-dark shrink-0">
          <div className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => setSelectedOutput(null)}
              className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
            >
              <span className="material-symbols-outlined text-[14px]">
                arrow_back
              </span>
              Studio
            </button>
            <span className="text-gray-300 dark:text-gray-600">/</span>
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${badgeColor}`}
            >
              <span className="material-symbols-outlined text-[12px]">
                {KIND_ICONS[selectedOutput.kind] ?? "auto_awesome"}
              </span>
              {KIND_LABELS[selectedOutput.kind] ?? selectedOutput.kind}
            </span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate pr-2">
              {selectedOutput.title}
            </h3>
            <button
              type="button"
              onClick={() => handleDelete(selectedOutput.id)}
              className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-500/10 text-red-500 transition-colors shrink-0"
              title="Delete"
            >
              <span className="material-symbols-outlined text-[16px]">
                delete
              </span>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          <StudioOutputView
            output={selectedOutput}
            onNodeClick={onMindmapNodeClick}
          />
        </div>
      </>
    );
  }

  // ─── Default List View ────────────────────────────────────────────
  return (
    <>
      <div className="p-4 flex items-center justify-between border-b border-border-light dark:border-border-dark shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-lg text-indigo-500 dark:text-indigo-400">
            auto_awesome
          </span>
          <h2 className="font-semibold text-gray-800 dark:text-gray-200">
            Studio
          </h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ── Audio Overview — Featured Hero ─────────────────────── */}
        <div className="p-4">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-5 shadow-lg shadow-indigo-500/10">
            {/* Glow effects */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)] pointer-events-none" />
            <div className="absolute -bottom-8 -right-8 w-32 h-32 bg-purple-400/20 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-inner">
                  <span className="material-symbols-outlined text-white text-xl icon-filled">
                    headphones
                  </span>
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm tracking-tight">
                    Audio Overview
                  </h3>
                  <p className="text-white/60 text-[11px]">
                    AI podcast about your sources
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAudioModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 backdrop-blur-sm text-white text-sm font-semibold transition-all border border-white/10 hover:border-white/20 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">
                  auto_awesome
                </span>
                Generate
              </button>
            </div>
          </div>
        </div>

        {/* ── Tools Grid ─────────────────────────────────────────── */}
        <div className="px-4 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[15px] text-gray-400 dark:text-gray-500">
              dashboard_customize
            </span>
            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.12em]">
              Generate
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {STUDIO_TOOLS.map((tool) => {
              const isGenerating = generatingKind === tool.kind;
              const colorParts = tool.color.split(" ");
              // Extract the bg class for the icon container
              const iconBg = colorParts.filter((c) => c.startsWith("bg-")).join(" ");
              const iconText = colorParts
                .filter((c) => c.startsWith("text-"))
                .join(" ");

              return (
                <button
                  key={tool.kind}
                  type="button"
                  disabled={isGenerating}
                  onClick={() =>
                    tool.kind === "quiz"
                      ? setQuizModalOpen(true)
                      : handleGenerate(tool.kind)
                  }
                  className="group flex items-center gap-2.5 p-2.5 rounded-xl bg-element-light dark:bg-element-dark hover:bg-gray-100 dark:hover:bg-gray-700/80 border border-transparent hover:border-border-light dark:hover:border-border-dark transition-all text-left disabled:opacity-50"
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${iconBg}`}
                  >
                    {isGenerating ? (
                      <span className="material-symbols-outlined text-[16px] animate-spin text-indigo-500">
                        progress_activity
                      </span>
                    ) : (
                      <span
                        className={`material-symbols-outlined text-[16px] ${iconText}`}
                      >
                        {tool.icon}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      {tool.label}
                    </p>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                      {tool.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Saved Outputs ──────────────────────────────────────── */}
        <div className="px-4 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-[15px] text-gray-400 dark:text-gray-500">
              inventory_2
            </span>
            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.12em]">
              Saved
            </span>
            {outputs.length > 0 && (
              <span className="text-[9px] font-bold text-white bg-indigo-500 px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {outputs.length}
              </span>
            )}
          </div>

          {outputs.length === 0 ? (
            <div className="text-center py-8 px-4">
              <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mx-auto mb-3">
                <span className="material-symbols-outlined text-2xl text-gray-300 dark:text-gray-600">
                  auto_fix_high
                </span>
              </div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                No outputs yet
              </p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                Generate study guides, quizzes, and more from your sources
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {outputs.map((output) => {
                const badgeColor =
                  KIND_BADGE_COLORS[output.kind] ??
                  "bg-gray-100 dark:bg-gray-500/15 text-gray-600 dark:text-gray-400";

                if (output.status === "generating") {
                  return (
                    <div
                      key={output.id}
                      className="mindmap-generating-card rounded-xl border border-indigo-200 dark:border-indigo-500/20 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-500/5 dark:to-purple-500/5 p-3"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[16px] text-indigo-500 dark:text-indigo-400 animate-spin">
                            progress_activity
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 truncate">
                            {output.title}
                          </p>
                          <p className="text-[10px] text-indigo-500/70 dark:text-indigo-400/70">
                            Generating...
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 h-1 w-full rounded-full bg-indigo-100 dark:bg-indigo-500/10 overflow-hidden">
                        <div
                          className="h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-400 to-purple-400"
                          style={{
                            animation: "shimmer 1.5s ease-in-out infinite",
                          }}
                        />
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={output.id}
                    type="button"
                    onClick={() => setSelectedOutput(output)}
                    className="group/item w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-element-light dark:hover:bg-element-dark transition-all text-left"
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${badgeColor}`}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {KIND_ICONS[output.kind] ?? "auto_awesome"}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
                        {output.title}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                          {formatRelativeDate(output.createdAt)}
                        </span>
                        {output.status === "error" && (
                          <span className="text-[10px] text-red-500 font-semibold flex items-center gap-0.5">
                            <span className="material-symbols-outlined text-[10px]">
                              error
                            </span>
                            Error
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="material-symbols-outlined text-[16px] text-gray-300 dark:text-gray-600 group-hover/item:text-gray-500 dark:group-hover/item:text-gray-400 transition-colors">
                      chevron_right
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <AudioOverviewModal
        open={audioModalOpen}
        onClose={() => {
          setAudioModalOpen(false);
          utils.studio.list.invalidate({ notebookId });
        }}
        notebookId={notebookId}
      />

      <QuizConfigModal
        open={quizModalOpen}
        onClose={() => {
          setQuizModalOpen(false);
        }}
        notebookId={notebookId}
      />
    </>
  );
}
