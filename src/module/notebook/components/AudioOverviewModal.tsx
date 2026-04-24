"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/trpc/client";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type Props = {
  open: boolean;
  onClose: () => void;
  notebookId: string;
};

type Length = "short" | "medium" | "long";

type Stage =
  | "idle"
  | "generating-script"
  | "converting-tts"
  | "combining"
  | "uploading"
  | "done"
  | "error";

type ScriptLine = {
  speaker: string;
  text: string;
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
function formatTime(secs: number) {
  if (!isFinite(secs) || isNaN(secs)) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const LENGTH_OPTIONS: { value: Length; label: string }[] = [
  { value: "short", label: "Short (~3 min)" },
  { value: "medium", label: "Medium (~8 min)" },
  { value: "long", label: "Long (~15 min)" },
];

const STAGE_LABELS: Record<string, string> = {
  "generating-script": "Generating script...",
  "converting-tts": "Converting to audio...",
  combining: "Combining audio...",
  uploading: "Uploading...",
  done: "Done!",
};

/* ------------------------------------------------------------------ */
/* AudioPlayer                                                         */
/* ------------------------------------------------------------------ */
function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateDuration = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      updateDuration();
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(1);
    };

    audio.addEventListener("loadedmetadata", updateDuration);
    audio.addEventListener("durationchange", updateDuration);
    audio.addEventListener("canplaythrough", updateDuration);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", updateDuration);
      audio.removeEventListener("durationchange", updateDuration);
      audio.removeEventListener("canplaythrough", updateDuration);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.play();
    }
    setPlaying(!playing);
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const audio = audioRef.current;
    const bar = progressRef.current;
    if (!audio || !bar || !audio.duration) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * audio.duration;
  }

  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 p-6 shadow-lg overflow-hidden">
      <audio ref={audioRef} src={src} preload="auto" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.1),transparent_60%)] pointer-events-none" />

      {/* Play button + time */}
      <div className="relative z-10 flex items-center gap-4">
        <button
          type="button"
          onClick={togglePlay}
          className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm flex items-center justify-center transition-colors shrink-0"
        >
          <span className="material-symbols-outlined text-white text-3xl icon-filled">
            {playing ? "pause" : "play_arrow"}
          </span>
        </button>

        <div className="flex-1 min-w-0">
          {/* Seek bar */}
          <div
            ref={progressRef}
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

          {/* Time */}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-white/70 font-mono">
              {formatTime(currentTime)}
            </span>
            <span className="text-xs text-white/70 font-mono">
              {formatTime(duration)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ScriptView                                                          */
/* ------------------------------------------------------------------ */
function ScriptView({ script }: { script: ScriptLine[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
      >
        <span className="material-symbols-outlined text-lg transition-transform" style={{ transform: expanded ? "rotate(180deg)" : undefined }}>
          expand_more
        </span>
        Podcast Script
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 max-h-[40vh] overflow-y-auto pr-1">
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
  );
}

/* ------------------------------------------------------------------ */
/* Main Modal                                                          */
/* ------------------------------------------------------------------ */
export function AudioOverviewModal({ open, onClose, notebookId }: Props) {
  const [length, setLength] = useState<Length>("medium");
  const [focus, setFocus] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [stageMsg, setStageMsg] = useState("");
  const [ttsProgress, setTtsProgress] = useState({ index: 0, total: 0 });
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [script, setScript] = useState<ScriptLine[]>([]);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const utils = trpc.useUtils();

  const reset = useCallback(() => {
    setStage("idle");
    setStageMsg("");
    setTtsProgress({ index: 0, total: 0 });
    setAudioUrl(null);
    setScript([]);
    setErrMsg(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
  }, [open, reset]);

  const run = useCallback(async () => {
    reset();
    setStage("generating-script");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/studio/audio-overview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notebookId,
          length,
          focus: focus.trim() || undefined,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line) as { type: string; data: unknown };
            handleEvent(evt);
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setStage("error");
      setErrMsg(err instanceof Error ? err.message : String(err));
    }

    function handleEvent(evt: { type: string; data: unknown }) {
      switch (evt.type) {
        case "stage": {
          const d = evt.data as { stage: string; message: string };
          const stageMap: Record<string, Stage> = {
            script: "generating-script",
            "converting-tts": "converting-tts",
            combine: "combining",
            upload: "uploading",
          };
          const mapped = stageMap[d.stage];
          if (mapped) setStage(mapped);
          setStageMsg(d.message);
          break;
        }
        case "script-delta": {
          // Streaming script text — show progress
          const d = evt.data as { text: string };
          setStageMsg(`Writing script... (${d.text.slice(0, 30)})`);
          break;
        }
        case "script-done": {
          const d = evt.data as { segments: number; script: ScriptLine[] };
          setScript(d.script);
          setStageMsg(`Script ready — ${d.segments} segments`);
          break;
        }
        case "tts": {
          const d = evt.data as { index: number; total: number };
          setTtsProgress({ index: d.index + 1, total: d.total });
          setStageMsg(
            `Converting to audio (${d.index + 1}/${d.total})...`,
          );
          break;
        }
        case "done": {
          const d = evt.data as { id: string; assetUrl: string };
          setStage("done");
          setStageMsg("Done!");
          setAudioUrl(d.assetUrl);
          utils.studio.list.invalidate({ notebookId });
          break;
        }
        case "error": {
          const d = evt.data as { message: string };
          setStage("error");
          setErrMsg(d.message);
          break;
        }
      }
    }
  }, [notebookId, length, focus, reset, utils]);

  if (!open) return null;

  const running =
    stage !== "idle" && stage !== "done" && stage !== "error";
  const progressPct =
    ttsProgress.total > 0
      ? Math.round((ttsProgress.index / ttsProgress.total) * 100)
      : 0;

  // Stage steps for the indicator
  const stages: { key: Stage; label: string }[] = [
    { key: "generating-script", label: "Script" },
    { key: "converting-tts", label: "Audio" },
    { key: "combining", label: "Combine" },
    { key: "uploading", label: "Upload" },
    { key: "done", label: "Done" },
  ];
  const stageOrder: Stage[] = stages.map((s) => s.key);
  const currentIdx = stageOrder.indexOf(stage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
        onClick={() => {
          abortRef.current?.abort();
          onClose();
        }}
      />
      <div className="relative w-full max-w-lg bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-gray-200/50 dark:border-gray-700/50">
        {/* Gradient accent bar */}
        <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <span className="material-symbols-outlined text-xl text-white icon-filled">
                headphones
              </span>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
                Audio Overview
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Deep dive conversation
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 pb-6 overflow-y-auto flex-1">
          {/* Configuration (shown before/during generation) */}
          {stage === "idle" && (
            <div className="space-y-5">
              {/* Length selector */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Length
                </label>
                <div className="flex gap-2">
                  {LENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLength(opt.value)}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border ${
                        length === opt.value
                          ? "bg-indigo-50 dark:bg-indigo-500/15 border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 shadow-sm"
                          : "bg-element-light dark:bg-element-dark border-border-light dark:border-border-dark text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom focus */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Custom focus{" "}
                  <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={focus}
                  onChange={(e) => setFocus(e.target.value)}
                  placeholder="Focus on a specific topic (optional)"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-element-dark text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-shadow"
                />
              </div>

              {/* Generate button */}
              <button
                type="button"
                onClick={run}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold transition-all shadow-md shadow-indigo-500/25 flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">
                  auto_awesome
                </span>
                Generate Audio Overview
              </button>
            </div>
          )}

          {/* Progress section */}
          {running && (
            <div className="space-y-5">
              {/* Stage steps */}
              <div className="flex items-center gap-1">
                {stages.map((s, i) => {
                  const isActive = s.key === stage;
                  const isCompleted = currentIdx > i;
                  return (
                    <div key={s.key} className="flex items-center flex-1">
                      <div className="flex flex-col items-center flex-1 gap-1.5">
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                            isCompleted
                              ? "bg-green-500 text-white"
                              : isActive
                                ? "bg-indigo-500 text-white animate-pulse"
                                : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500"
                          }`}
                        >
                          {isCompleted ? (
                            <span className="material-symbols-outlined text-sm">
                              check
                            </span>
                          ) : (
                            i + 1
                          )}
                        </div>
                        <span
                          className={`text-[10px] font-medium ${
                            isCompleted
                              ? "text-green-600 dark:text-green-400"
                              : isActive
                                ? "text-indigo-600 dark:text-indigo-400"
                                : "text-gray-400 dark:text-gray-500"
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                      {i < stages.length - 1 && (
                        <div
                          className={`h-0.5 flex-1 -mt-5 mx-1 rounded-full ${
                            isCompleted
                              ? "bg-green-400"
                              : "bg-gray-200 dark:bg-gray-700"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Stage message */}
              <div className="flex items-center gap-2 justify-center">
                <span className="material-symbols-outlined text-lg text-indigo-500 animate-spin">
                  progress_activity
                </span>
                <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  {stageMsg || STAGE_LABELS[stage] || "Processing..."}
                </span>
              </div>

              {/* TTS progress bar */}
              {stage === "converting-tts" && ttsProgress.total > 0 && (
                <div className="space-y-2">
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                    {ttsProgress.index} of {ttsProgress.total} segments
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error state */}
          {stage === "error" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center py-6 gap-3">
                <span className="material-symbols-outlined text-4xl text-red-400">
                  error
                </span>
                <p className="text-sm text-red-600 dark:text-red-400 text-center">
                  {errMsg || "An error occurred during generation."}
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="w-full py-2.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Done / Result */}
          {stage === "done" && audioUrl && (
            <div className="space-y-4">
              {/* Success message */}
              <div className="flex items-center gap-2 justify-center mb-2">
                <span className="material-symbols-outlined text-lg text-green-500">
                  check_circle
                </span>
                <span className="text-sm font-medium text-green-600 dark:text-green-400">
                  Audio overview generated!
                </span>
              </div>

              {/* Audio player */}
              <div className="relative overflow-hidden rounded-2xl">
                <AudioPlayer src={audioUrl} />
              </div>

              {/* Script accordion */}
              {script.length > 0 && <ScriptView script={script} />}

              {/* Close button */}
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors mt-2"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
