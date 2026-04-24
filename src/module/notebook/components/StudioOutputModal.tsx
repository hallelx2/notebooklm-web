"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MindMapRenderer } from "./MindMapRenderer";

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

type Props = {
  output: StudioOutput;
  onClose: () => void;
  onDelete: (id: string) => void;
  onNodeClick?: (nodeText: string) => void;
};

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

const KIND_COLORS: Record<string, string> = {
  "audio-overview": "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  "study-guide": "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  "briefing-doc": "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  faq: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  timeline: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  "mind-map": "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  flashcards: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-300",
  quiz: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300",
};

/* ------------------------------------------------------------------ */
/* Text content renderer                                               */
/* ------------------------------------------------------------------ */
function TextContent({ text }: { text: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:rounded-lg">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Mind Map renderer (removed – now using MindMapRenderer component)    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Flashcards renderer                                                  */
/* ------------------------------------------------------------------ */
function FlashcardsContent({
  cards,
}: {
  cards: { front: string; back: string }[];
}) {
  const [flipped, setFlipped] = useState<Set<number>>(new Set());

  function toggle(idx: number) {
    setFlipped((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {cards.map((card, i) => {
        const isFlipped = flipped.has(i);
        return (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className="relative min-h-[140px] rounded-xl border border-border-light dark:border-border-dark bg-element-light dark:bg-element-dark p-4 text-left transition-all hover:shadow-md cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {isFlipped ? "Answer" : "Question"} #{i + 1}
              </span>
              <span className="material-symbols-outlined text-[14px] text-gray-400">
                {isFlipped ? "visibility" : "visibility_off"}
              </span>
            </div>
            <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
              {isFlipped ? card.back : card.front}
            </p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-3">
              Click to {isFlipped ? "see question" : "reveal answer"}
            </p>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quiz renderer                                                        */
/* ------------------------------------------------------------------ */
function QuizContent({
  questions,
}: {
  questions: { question: string; options: string[]; answer: number }[];
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({});

  function selectAnswer(qIdx: number, oIdx: number) {
    if (answers[qIdx] !== undefined) return; // already answered
    setAnswers((prev) => ({ ...prev, [qIdx]: oIdx }));
  }

  const total = questions.length;
  const attempted = Object.keys(answers).length;
  const correct = Object.entries(answers).filter(
    ([qIdx, oIdx]) => questions[Number(qIdx)]?.answer === oIdx,
  ).length;

  return (
    <div className="space-y-6">
      {attempted === total && total > 0 && (
        <div className="rounded-xl bg-element-light dark:bg-element-dark p-4 text-center border border-border-light dark:border-border-dark">
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Score: {correct}/{total}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {correct === total
              ? "Perfect score!"
              : correct >= total * 0.7
                ? "Great job!"
                : "Keep studying!"}
          </p>
        </div>
      )}

      {questions.map((q, qIdx) => {
        const selected = answers[qIdx];
        const hasAnswered = selected !== undefined;
        return (
          <div key={qIdx} className="space-y-2">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
              <span className="text-gray-400 dark:text-gray-500 mr-1.5">
                {qIdx + 1}.
              </span>
              {q.question}
            </p>
            <div className="space-y-1.5 ml-4">
              {q.options.map((option, oIdx) => {
                let optionStyle =
                  "border-border-light dark:border-border-dark bg-element-light dark:bg-element-dark hover:bg-gray-200 dark:hover:bg-gray-600";
                if (hasAnswered) {
                  if (oIdx === q.answer) {
                    optionStyle =
                      "border-emerald-400 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10";
                  } else if (oIdx === selected && oIdx !== q.answer) {
                    optionStyle =
                      "border-red-400 dark:border-red-500/50 bg-red-50 dark:bg-red-500/10";
                  }
                }

                return (
                  <button
                    key={oIdx}
                    type="button"
                    onClick={() => selectAnswer(qIdx, oIdx)}
                    disabled={hasAnswered}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-left text-sm transition-all ${optionStyle} ${!hasAnswered ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 text-[10px] font-bold ${
                        hasAnswered && oIdx === q.answer
                          ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                          : hasAnswered && oIdx === selected
                            ? "border-red-500 text-red-600 dark:text-red-400"
                            : "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400"
                      }`}
                    >
                      {String.fromCharCode(65 + oIdx)}
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {option}
                    </span>
                    {hasAnswered && oIdx === q.answer && (
                      <span className="material-symbols-outlined text-[16px] text-emerald-500 ml-auto">
                        check_circle
                      </span>
                    )}
                    {hasAnswered && oIdx === selected && oIdx !== q.answer && (
                      <span className="material-symbols-outlined text-[16px] text-red-500 ml-auto">
                        cancel
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Audio Overview player                                                */
/* ------------------------------------------------------------------ */
function formatAudioTime(secs: number) {
  if (!isFinite(secs) || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type ScriptLine = { speaker: string; text: string };

function AudioOverviewPlayer({
  assetUrl,
  content,
}: {
  assetUrl: string;
  content: Record<string, unknown> | unknown[] | null;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [showScript, setShowScript] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta = () => setDuration(audio.duration);
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration) setProgress(audio.currentTime / audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
    };
  }, [assetUrl]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) audio.pause();
    else audio.play();
    setPlaying(!playing);
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    const bar = barRef.current;
    if (!audio || !bar || !audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  }

  // Try to extract script from content
  let script: ScriptLine[] = [];
  if (content && typeof content === "object" && "script" in content) {
    const raw = (content as Record<string, unknown>).script;
    if (Array.isArray(raw)) {
      script = raw as ScriptLine[];
    }
  }

  return (
    <div className="space-y-5">
      {/* Audio player card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-6 shadow-lg">
        <audio ref={audioRef} src={assetUrl} preload="metadata" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_60%)] pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center gap-4">
          {/* Large centered play button */}
          <button
            type="button"
            onClick={togglePlay}
            className="w-16 h-16 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-white text-4xl icon-filled">
              {playing ? "pause" : "play_arrow"}
            </span>
          </button>

          {/* Seek bar */}
          <div className="w-full">
            <div
              ref={barRef}
              onClick={seek}
              className="group relative w-full h-2 bg-white/20 rounded-full cursor-pointer"
            >
              <div
                className="absolute inset-y-0 left-0 bg-white/80 rounded-full transition-[width] duration-100"
                style={{ width: `${progress * 100}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progress * 100}% - 7px)` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-white/70 font-mono">
                {formatAudioTime(currentTime)}
              </span>
              <span className="text-xs text-white/70 font-mono">
                {formatAudioTime(duration)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Script conversation view */}
      {script.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowScript(!showScript)}
            className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-3"
          >
            <span
              className="material-symbols-outlined text-lg transition-transform"
              style={{ transform: showScript ? "rotate(180deg)" : undefined }}
            >
              expand_more
            </span>
            Podcast Script
          </button>
          {showScript && (
            <div className="space-y-3">
              {script.map((line, i) => {
                const isAlex = line.speaker.toLowerCase().includes("alex");
                return (
                  <div key={i} className="flex gap-3">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isAlex
                          ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                          : "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300"
                      }`}
                    >
                      {line.speaker.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-xs font-semibold mb-0.5 ${
                          isAlex
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-purple-600 dark:text-purple-400"
                        }`}
                      >
                        {line.speaker}
                      </p>
                      <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {line.text}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Fallback: show text content if there's a text field but no script */}
      {script.length === 0 &&
        content &&
        typeof content === "object" &&
        "text" in content && (
          <TextContent
            text={String((content as Record<string, unknown>).text)}
          />
        )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main Modal                                                           */
/* ------------------------------------------------------------------ */
export function StudioOutputModal({ output, onClose, onDelete, onNodeClick }: Props) {
  const content = output.content as Record<string, unknown> | unknown[] | null;
  const kind = output.kind;
  const icon = KIND_ICONS[kind] ?? "auto_awesome";
  const colorClass =
    KIND_COLORS[kind] ??
    "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-300";

  function renderBody() {
    if (output.status === "generating") {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="material-symbols-outlined text-4xl text-gray-400 animate-spin">
            progress_activity
          </span>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Generating content...
          </p>
        </div>
      );
    }

    if (output.status === "error") {
      const errorMsg =
        content && typeof content === "object" && "error" in content
          ? String((content as Record<string, unknown>).error)
          : "An error occurred during generation.";
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="material-symbols-outlined text-4xl text-red-400">
            error
          </span>
          <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
        </div>
      );
    }

    if (!content) {
      return (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-8 text-center">
          No content available.
        </p>
      );
    }

    // Mind map (markmap-based)
    if (kind === "mind-map" && typeof content === "object" && "markdown" in content) {
      return (
        <MindMapRenderer
          markdown={String((content as Record<string, unknown>).markdown)}
          onNodeClick={onNodeClick}
        />
      );
    }

    // Mind map (legacy JSON format fallback)
    if (kind === "mind-map" && typeof content === "object" && "center" in content) {
      const legacy = content as { center: string; branches: { label: string; children: string[] }[] };
      // Convert legacy JSON to markdown for markmap
      let md = `# ${legacy.center}\n`;
      for (const branch of legacy.branches ?? []) {
        md += `## ${branch.label}\n`;
        for (const child of branch.children ?? []) {
          md += `### ${child}\n`;
        }
      }
      return <MindMapRenderer markdown={md} onNodeClick={onNodeClick} />;
    }

    // Flashcards
    if (kind === "flashcards" && Array.isArray(content)) {
      return (
        <FlashcardsContent
          cards={content as { front: string; back: string }[]}
        />
      );
    }

    // Quiz
    if (kind === "quiz" && Array.isArray(content)) {
      return (
        <QuizContent
          questions={
            content as { question: string; options: string[]; answer: number }[]
          }
        />
      );
    }

    // Audio overview with audio file
    if (kind === "audio-overview" && output.assetUrl) {
      return (
        <AudioOverviewPlayer assetUrl={output.assetUrl} content={content} />
      );
    }

    // Text content (study-guide, briefing-doc, faq, timeline, audio-overview, fallback)
    if (typeof content === "object" && "text" in content) {
      return <TextContent text={String((content as Record<string, unknown>).text)} />;
    }

    // Fallback for anything else
    return <TextContent text={JSON.stringify(content, null, 2)} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className={`relative w-full ${kind === "mind-map" ? "max-w-5xl" : "max-w-3xl"} bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-light dark:border-border-dark shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="material-symbols-outlined text-2xl text-blue-600 dark:text-blue-400">
              {icon}
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200 truncate">
                {output.title}
              </h2>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${colorClass}`}
              >
                {kind.replace(/-/g, " ")}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onDelete(output.id)}
              className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-500/10 text-red-500 transition-colors"
              title="Delete"
            >
              <span className="material-symbols-outlined">delete</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors"
              title="Close"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">{renderBody()}</div>
      </div>
    </div>
  );
}
