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
  onNodeClick?: (nodeText: string) => void;
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
/* Flashcards renderer — single card, flip, arrow keys                  */
/* ------------------------------------------------------------------ */
function FlashcardsContent({
  cards,
}: {
  cards: { front: string; back: string }[];
}) {
  const [current, setCurrent] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const card = cards[current];
  const total = cards.length;

  function goNext() {
    if (current < total - 1) {
      setCurrent((i) => i + 1);
      setIsFlipped(false);
    }
  }
  function goPrev() {
    if (current > 0) {
      setCurrent((i) => i - 1);
      setIsFlipped(false);
    }
  }
  function flip() {
    setIsFlipped((f) => !f);
  }

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      }
    }
    const el = containerRef.current;
    if (el) {
      el.addEventListener("keydown", onKey);
      el.focus();
    }
    return () => {
      if (el) el.removeEventListener("keydown", onKey);
    };
  });

  if (!card) return null;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex flex-col items-center outline-none select-none"
    >
      {/* Progress bar */}
      <div className="w-full flex items-center gap-3 mb-5">
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0">
          {current + 1}/{total}
        </span>
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300"
            style={{ width: `${((current + 1) / total) * 100}%` }}
          />
        </div>
      </div>

      {/* Card with flip */}
      <div
        className="w-full perspective-[800px] cursor-pointer"
        onClick={flip}
      >
        <div
          className={`relative w-full min-h-[260px] transition-transform duration-500 transform-style-3d ${
            isFlipped ? "[transform:rotateY(180deg)]" : ""
          }`}
          style={{ transformStyle: "preserve-3d" }}
        >
          {/* Front face */}
          <div
            className="absolute inset-0 rounded-2xl border-2 border-indigo-200 dark:border-indigo-500/30 bg-gradient-to-br from-indigo-50 via-white to-purple-50 dark:from-indigo-900/20 dark:via-surface-dark dark:to-purple-900/20 p-8 flex flex-col justify-center items-center text-center shadow-lg"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 dark:text-indigo-500 mb-4">
              Question
            </span>
            <p className="text-lg font-medium text-gray-800 dark:text-gray-100 leading-relaxed">
              {card.front}
            </p>
            <span className="mt-6 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">touch_app</span>
              Tap to reveal answer
            </span>
          </div>

          {/* Back face */}
          <div
            className="absolute inset-0 rounded-2xl border-2 border-emerald-200 dark:border-emerald-500/30 bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-emerald-900/20 dark:via-surface-dark dark:to-teal-900/20 p-8 flex flex-col justify-center items-center text-center shadow-lg [transform:rotateY(180deg)]"
            style={{ backfaceVisibility: "hidden" }}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400 dark:text-emerald-500 mb-4">
              Answer
            </span>
            <p className="text-base text-gray-800 dark:text-gray-100 leading-relaxed">
              {card.back}
            </p>
            <span className="mt-6 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">touch_app</span>
              Tap to see question
            </span>
          </div>
        </div>
      </div>

      {/* Navigation arrows */}
      <div className="flex items-center gap-4 mt-6">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          disabled={current === 0}
          className="w-10 h-10 rounded-full bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">
            arrow_back
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); flip(); }}
          className="px-4 py-2 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-xs font-medium hover:bg-indigo-200 dark:hover:bg-indigo-500/30 transition-colors"
        >
          Flip card
        </button>

        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          disabled={current === total - 1}
          className="w-10 h-10 rounded-full bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">
            arrow_forward
          </span>
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-500">
        Use ← → arrow keys to navigate, Space to flip
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Quiz renderer — single-question-at-a-time with results & AI summary */
/* ------------------------------------------------------------------ */
function QuizContent({
  questions,
}: {
  questions: { question: string; options: string[]; answer: number }[];
}) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [showResults, setShowResults] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const total = questions.length;
  const q = questions[current];
  const selectedOption = answers[current];
  const hasAnswered = selectedOption !== undefined;
  const allAnswered = Object.keys(answers).length === total;
  const correct = Object.entries(answers).filter(
    ([qIdx, oIdx]) => questions[Number(qIdx)]?.answer === oIdx,
  ).length;

  function goNext() {
    if (current < total - 1) setCurrent((i) => i + 1);
  }
  function goPrev() {
    if (current > 0) setCurrent((i) => i - 1);
  }

  function selectAnswer(oIdx: number) {
    if (hasAnswered) return;
    setAnswers((prev) => ({ ...prev, [current]: oIdx }));
    // Auto-advance after a short delay
    setTimeout(() => {
      setCurrent((cur) => {
        if (cur < total - 1) return cur + 1;
        // Last question answered — show results
        setShowResults(true);
        return cur;
      });
    }, 800);
  }

  function retake() {
    setAnswers({});
    setCurrent(0);
    setShowResults(false);
    setSummary(null);
    setLoadingSummary(false);
  }

  async function generateSummary() {
    setLoadingSummary(true);
    try {
      const res = await fetch("/api/studio/quiz-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, answers }),
      });
      if (!res.ok) throw new Error("Failed to generate summary");
      const data = await res.json();
      setSummary(data.summary ?? data.text ?? "No summary returned.");
    } catch {
      setSummary("Failed to generate summary. Please try again.");
    } finally {
      setLoadingSummary(false);
    }
  }

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showResults) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
      // Select option with number keys
      if (["1", "2", "3", "4"].includes(e.key) && !hasAnswered) {
        e.preventDefault();
        selectAnswer(Number(e.key) - 1);
      }
    }
    const el = containerRef.current;
    if (el) {
      el.addEventListener("keydown", onKey);
      el.focus();
    }
    return () => {
      if (el) el.removeEventListener("keydown", onKey);
    };
  });

  if (!q && !showResults) return null;

  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const scoreColor =
    pct >= 70
      ? "text-emerald-500"
      : pct >= 50
        ? "text-amber-500"
        : "text-red-500";
  const scoreBg =
    pct >= 70
      ? "from-emerald-500/20 to-emerald-600/5"
      : pct >= 50
        ? "from-amber-500/20 to-amber-600/5"
        : "from-red-500/20 to-red-600/5";
  const scoreBorder =
    pct >= 70
      ? "border-emerald-300 dark:border-emerald-500/30"
      : pct >= 50
        ? "border-amber-300 dark:border-amber-500/30"
        : "border-red-300 dark:border-red-500/30";
  const encouragement =
    pct === 100
      ? "Perfect score! Outstanding work!"
      : pct >= 90
        ? "Excellent! You really know this material!"
        : pct >= 70
          ? "Great job! You have a solid understanding."
          : pct >= 50
            ? "Good effort! Review the topics you missed."
            : "Keep studying! You'll get there with practice.";

  /* ---- Results mode ---- */
  if (showResults) {
    return (
      <div
        ref={containerRef}
        tabIndex={0}
        className="flex flex-col outline-none select-none space-y-5"
      >
        {/* Score card */}
        <div
          className={`rounded-2xl border ${scoreBorder} bg-gradient-to-br ${scoreBg} p-6 text-center`}
        >
          <div className="flex items-center justify-center gap-1">
            <span className={`text-5xl font-extrabold ${scoreColor}`}>
              {correct}
            </span>
            <span className="text-2xl font-medium text-gray-400 dark:text-gray-500">
              /{total}
            </span>
          </div>
          <p className={`text-lg font-semibold mt-1 ${scoreColor}`}>{pct}%</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {encouragement}
          </p>
        </div>

        {/* Question review list */}
        <div className="rounded-xl border border-border-light dark:border-border-dark bg-element-light dark:bg-element-dark overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border-light dark:border-border-dark">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Question Review
            </p>
          </div>
          <div className="divide-y divide-border-light dark:divide-border-dark">
            {questions.map((question, qIdx) => {
              const userAnswer = answers[qIdx];
              const isCorrect = userAnswer === question.answer;
              const questionPreview =
                question.question.length > 60
                  ? question.question.slice(0, 60) + "..."
                  : question.question;
              return (
                <div
                  key={qIdx}
                  className="flex items-start gap-3 px-4 py-2.5"
                >
                  <span
                    className={`material-symbols-outlined text-base mt-0.5 shrink-0 ${isCorrect ? "text-emerald-500" : "text-red-500"}`}
                  >
                    {isCorrect ? "check_circle" : "cancel"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 dark:text-gray-300 leading-snug">
                      <span className="font-semibold text-gray-400 dark:text-gray-500 mr-1">
                        {qIdx + 1}.
                      </span>
                      {questionPreview}
                    </p>
                    {!isCorrect && userAnswer !== undefined && (
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Your answer:{" "}
                        <span className="text-red-500">
                          {question.options[userAnswer]}
                        </span>{" "}
                        &middot; Correct:{" "}
                        <span className="text-emerald-500">
                          {question.options[question.answer]}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Summary section */}
        <div className="rounded-xl border border-border-light dark:border-border-dark bg-element-light dark:bg-element-dark p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-500 text-lg">
              auto_awesome
            </span>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              AI Study Summary
            </p>
          </div>

          {!summary && !loadingSummary && (
            <button
              type="button"
              onClick={generateSummary}
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm"
            >
              Generate Study Summary
            </button>
          )}

          {loadingSummary && (
            <div className="flex items-center justify-center gap-2 py-4">
              <span className="material-symbols-outlined text-amber-500 text-xl animate-spin">
                progress_activity
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Generating summary...
              </span>
            </div>
          )}

          {summary && (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-2 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {summary}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Retake button */}
        <button
          type="button"
          onClick={retake}
          className="w-full py-3 rounded-xl border-2 border-amber-400 dark:border-amber-500/40 text-amber-600 dark:text-amber-400 text-sm font-semibold hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">replay</span>
          Retake Quiz
        </button>
      </div>
    );
  }

  /* ---- Answering mode ---- */
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex flex-col outline-none select-none"
    >
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-5">
        <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0">
          {current + 1}/{total}
        </span>
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-300"
            style={{ width: `${((current + 1) / total) * 100}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {Object.keys(answers).length} answered
        </span>
      </div>

      {/* Question card */}
      <div className="rounded-2xl border-2 border-amber-200 dark:border-amber-500/30 bg-gradient-to-br from-amber-50 via-white to-orange-50 dark:from-amber-900/20 dark:via-surface-dark dark:to-orange-900/20 p-6 mb-5 shadow-lg">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500 text-white text-xs font-bold mb-3">
          {current + 1}
        </span>
        <p className="text-lg font-medium text-gray-800 dark:text-gray-100 leading-relaxed">
          {q.question}
        </p>
      </div>

      {/* Options */}
      <div className="space-y-2.5 mb-5">
        {q.options.map((option, oIdx) => {
          const letter = String.fromCharCode(65 + oIdx);
          let optionStyle =
            "border-border-light dark:border-border-dark bg-element-light dark:bg-element-dark hover:bg-gray-100 dark:hover:bg-gray-600 hover:border-amber-300 dark:hover:border-amber-500/40";
          let iconEl: React.ReactNode = null;
          let letterStyle =
            "border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800";

          if (hasAnswered) {
            if (oIdx === q.answer) {
              optionStyle =
                "border-emerald-400 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10";
              letterStyle =
                "border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/20";
              iconEl = (
                <span className="material-symbols-outlined text-base text-emerald-500">
                  check_circle
                </span>
              );
            } else if (oIdx === selectedOption && oIdx !== q.answer) {
              optionStyle =
                "border-red-400 dark:border-red-500/50 bg-red-50 dark:bg-red-500/10";
              letterStyle =
                "border-red-500 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/20";
              iconEl = (
                <span className="material-symbols-outlined text-base text-red-500">
                  cancel
                </span>
              );
            } else {
              optionStyle =
                "border-border-light dark:border-border-dark bg-element-light/50 dark:bg-element-dark/50 opacity-60";
            }
          }

          return (
            <button
              key={oIdx}
              type="button"
              onClick={() => selectAnswer(oIdx)}
              disabled={hasAnswered}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 text-left transition-all ${optionStyle} ${!hasAnswered ? "cursor-pointer" : "cursor-default"}`}
            >
              <span
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0 text-sm font-bold transition-colors ${letterStyle}`}
              >
                {letter}
              </span>
              <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 leading-snug">
                {option}
              </span>
              {iconEl}
            </button>
          );
        })}
      </div>

      {/* Navigation arrows + finish/skip */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={current === 0}
          className="w-10 h-10 rounded-full bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">
            arrow_back
          </span>
        </button>

        {allAnswered ? (
          <button
            type="button"
            onClick={() => setShowResults(true)}
            className="px-5 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm"
          >
            Finish Quiz
          </button>
        ) : Object.keys(answers).length > 0 ? (
          <button
            type="button"
            onClick={() => setShowResults(true)}
            className="px-4 py-2 rounded-full bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark text-xs font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Skip to Results
          </button>
        ) : null}

        <button
          type="button"
          onClick={goNext}
          disabled={current === total - 1}
          className="w-10 h-10 rounded-full bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark flex items-center justify-center transition-colors hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <span className="material-symbols-outlined text-gray-600 dark:text-gray-300">
            arrow_forward
          </span>
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="mt-3 text-[10px] text-gray-400 dark:text-gray-500 text-center">
        Use &larr; &rarr; arrow keys to navigate, 1-4 to select an answer
      </p>
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
    const updateDuration = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onTime = () => {
      setCurrentTime(audio.currentTime);
      updateDuration(); // duration can resolve late for concatenated MP3s
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(1);
    };
    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("canplaythrough", updateDuration);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("canplaythrough", updateDuration);
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
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    audio.currentTime = ratio * audio.duration;
  }

  let script: ScriptLine[] = [];
  if (content && typeof content === "object" && "script" in content) {
    const raw = (content as Record<string, unknown>).script;
    if (Array.isArray(raw)) {
      script = raw as ScriptLine[];
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-5 shadow-lg">
        <audio ref={audioRef} src={assetUrl} preload="auto" />
        <div className="relative z-10 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-white text-3xl icon-filled">
              {playing ? "pause" : "play_arrow"}
            </span>
          </button>
          <div className="w-full">
            <div
              ref={barRef}
              onClick={seek}
              className="group relative w-full h-1.5 bg-white/20 rounded-full cursor-pointer"
            >
              <div
                className="absolute inset-y-0 left-0 bg-white/80 rounded-full"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-[10px] text-white/70 font-mono">
                {formatAudioTime(currentTime)}
              </span>
              <span className="text-[10px] text-white/70 font-mono">
                {formatAudioTime(duration)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {script.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowScript(!showScript)}
            className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors mb-2"
          >
            <span
              className="material-symbols-outlined text-base transition-transform"
              style={{ transform: showScript ? "rotate(180deg)" : undefined }}
            >
              expand_more
            </span>
            Podcast Script
          </button>
          {showScript && (
            <div className="space-y-2">
              {script.map((line, i) => {
                const isAlex = line.speaker.toLowerCase().includes("alex");
                return (
                  <div key={i} className="flex gap-2">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                        isAlex
                          ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                          : "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300"
                      }`}
                    >
                      {line.speaker.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-[10px] font-semibold ${
                          isAlex
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-purple-600 dark:text-purple-400"
                        }`}
                      >
                        {line.speaker}
                      </p>
                      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
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
/* Main inline view (replaces the old modal)                            */
/* ------------------------------------------------------------------ */
export function StudioOutputView({ output, onNodeClick }: Props) {
  const content = output.content as Record<string, unknown> | unknown[] | null;
  const kind = output.kind;

  if (output.status === "generating") {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="material-symbols-outlined text-4xl text-indigo-500 animate-spin">
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
      <div className="flex flex-col items-center justify-center py-16 gap-3 px-4">
        <span className="material-symbols-outlined text-4xl text-red-400">
          error
        </span>
        <p className="text-sm text-red-600 dark:text-red-400 text-center">
          {errorMsg}
        </p>
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

  // Mind map (markmap-based) — render full height
  if (
    kind === "mind-map" &&
    typeof content === "object" &&
    "markdown" in content
  ) {
    return (
      <div className="h-full">
        <MindMapRenderer
          markdown={String((content as Record<string, unknown>).markdown)}
          onNodeClick={onNodeClick}
        />
      </div>
    );
  }

  // Mind map (legacy JSON format fallback)
  if (
    kind === "mind-map" &&
    typeof content === "object" &&
    "center" in content
  ) {
    const legacy = content as {
      center: string;
      branches: { label: string; children: string[] }[];
    };
    let md = `# ${legacy.center}\n`;
    for (const branch of legacy.branches ?? []) {
      md += `## ${branch.label}\n`;
      for (const child of branch.children ?? []) {
        md += `### ${child}\n`;
      }
    }
    return (
      <div className="h-full">
        <MindMapRenderer markdown={md} onNodeClick={onNodeClick} />
      </div>
    );
  }

  // Flashcards
  if (kind === "flashcards" && Array.isArray(content)) {
    return (
      <div className="p-4">
        <FlashcardsContent
          cards={content as { front: string; back: string }[]}
        />
      </div>
    );
  }

  // Quiz
  if (kind === "quiz" && Array.isArray(content)) {
    return (
      <div className="p-4">
        <QuizContent
          questions={
            content as { question: string; options: string[]; answer: number }[]
          }
        />
      </div>
    );
  }

  // Audio overview with audio file
  if (kind === "audio-overview" && output.assetUrl) {
    return (
      <div className="p-4">
        <AudioOverviewPlayer assetUrl={output.assetUrl} content={content} />
      </div>
    );
  }

  // Text content (study-guide, briefing-doc, faq, timeline, fallback)
  if (typeof content === "object" && "text" in content) {
    return (
      <div className="p-4">
        <TextContent
          text={String((content as Record<string, unknown>).text)}
        />
      </div>
    );
  }

  // Fallback
  return (
    <div className="p-4">
      <TextContent text={JSON.stringify(content, null, 2)} />
    </div>
  );
}
