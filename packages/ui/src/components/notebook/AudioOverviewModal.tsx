"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "../../trpc/client";

/* ------------------------------------------------------------------ */
/* Types */
/* ------------------------------------------------------------------ */
type Props = {
 open: boolean;
 onClose: () => void;
 notebookId: string;
 /**
 * When set, the modal opens in "reattach" mode — it skips the
 * configuration form and the POST to /api/studio/audio-overview,
 * and instead polls `studio.byId(reattachId)` to reconstruct the
 * progress UI from the row's persisted `progress` snapshot. Set this
 * when the user clicks an in-flight "Generating..." pill in the
 * Studio panel.
 */
 reattachId?: string | null;
};

type ProgressSnapshot = {
 stage?: string;
 message?: string;
 ttsCompleted?: number;
 ttsTotal?: number;
 provider?: string;
 concurrency?: number;
 updatedAt?: string;
};

type Length = "short" | "medium" | "long";
type TtsProvider = "deepgram" | "kokoro";

type Stage =
 | "idle"
 | "generating-script"
 | "converting-tts"
 | "combining"
 | "uploading"
 | "done"
 | "error"
 | "cancelled";

type ScriptLine = {
 speaker: string;
 text: string;
};

/* ------------------------------------------------------------------ */
/* Helpers */
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

const TTS_OPTIONS: {
 value: TtsProvider;
 label: string;
 hint: string;
 icon: string;
}[] = [
 {
 value: "kokoro",
 label: "Kokoro (local)",
 hint: "Runs on your machine via Kokoro-FastAPI. Free, offline, no rate limits.",
 icon: "home_storage",
 },
 {
 value: "deepgram",
 label: "Deepgram (cloud)",
 hint: "Polished Aura voices. Requires DEEPGRAM_API_KEY and an internet connection.",
 icon: "cloud",
 },
];

const STAGE_LABELS: Record<string, string> = {
 "generating-script": "Generating script...",
 "converting-tts": "Converting to audio...",
 combining: "Combining audio...",
 uploading: "Uploading...",
 done: "Done!",
};

/* ------------------------------------------------------------------ */
/* AudioPlayer */
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
 const ratio = Math.max(
 0,
 Math.min(1, (e.clientX - rect.left) / rect.width),
 );
 audio.currentTime = ratio * audio.duration;
 }

 return (
 <div className="relative rounded-2xl bg-[var(--ds-accent-gradient)] p-6 shadow-lg overflow-hidden">
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
/* ScriptView */
/* ------------------------------------------------------------------ */
function ScriptView({ script }: { script: ScriptLine[] }) {
 const [expanded, setExpanded] = useState(false);

 return (
 <div className="mt-4">
 <button
 type="button"
 onClick={() => setExpanded(!expanded)}
 className="flex items-center gap-2 text-sm font-medium text-fg-secondary dark:text-fg-muted hover:text-fg-secondary dark:hover:text-fg-secondary transition-colors"
 >
 <span
 className="material-symbols-outlined text-lg transition-transform"
 style={{ transform: expanded ? "rotate(180deg)" : undefined }}
 >
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
 ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-fg-accent"
 : "bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300"
 }`}
 >
 {line.speaker.charAt(0).toUpperCase()}
 </div>
 <div className="flex-1 min-w-0">
 <p
 className={`text-xs font-semibold mb-0.5 ${
 isAlex
 ? "text-blue-600 dark:text-fg-accent"
 : "text-purple-600 dark:text-purple-400"
 }`}
 >
 {line.speaker}
 </p>
 <p className="text-sm text-fg-secondary dark:text-fg-secondary leading-relaxed">
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
/* Main Modal */
/* ------------------------------------------------------------------ */
export function AudioOverviewModal({
 open,
 onClose,
 notebookId,
 reattachId = null,
}: Props) {
 const [length, setLength] = useState<Length>("medium");
 const [focus, setFocus] = useState("");
 // Default to Kokoro because it's local-first; the server falls back
 // to whichever provider it actually has if the user-selected one
 // isn't configured (a 400 with `available` comes back).
 const [ttsProvider, setTtsProvider] = useState<TtsProvider>("kokoro");
 const [stage, setStage] = useState<Stage>("idle");
 const [stageMsg, setStageMsg] = useState("");
 const [ttsProgress, setTtsProgress] = useState({ index: 0, total: 0 });
 const [audioUrl, setAudioUrl] = useState<string | null>(null);
 const [script, setScript] = useState<ScriptLine[]>([]);
 const [errMsg, setErrMsg] = useState<string | null>(null);
 // Server-side row id, captured the moment the streaming response
 // emits its first event with one. We need this for the cancel
 // button, which posts to /api/studio/cancel { id } so the in-process
 // registry can flip the cancellation flag for that specific job.
 const [jobId, setJobId] = useState<string | null>(null);
 const [cancelling, setCancelling] = useState(false);
 const abortRef = useRef<AbortController | null>(null);
 const utils = trpc.useUtils();

 const reset = useCallback(() => {
 setStage("idle");
 setStageMsg("");
 setTtsProgress({ index: 0, total: 0 });
 setAudioUrl(null);
 setScript([]);
 setErrMsg(null);
 setJobId(null);
 setCancelling(false);
 }, []);

 useEffect(() => {
 if (!open) return;
 reset();
 if (reattachId) {
 // We're attaching to an in-flight job. Skip the configuration
 // form, jump straight to a loading-ish state — the polling
 // useQuery below picks up the live progress snapshot from the
 // row and drives the UI.
 setJobId(reattachId);
 setStage("generating-script");
 setStageMsg("Reattaching to running job...");
 }
 }, [open, reset, reattachId]);

 /**
 * Poll the row when reattached. We only enable this query while the
 * modal is open *and* we have a row id we didn't kick off ourselves
 * — once the streaming `run()` path takes over, those events drive
 * the UI faster than 1.5s polling could.
 */
 const reattachQuery = trpc.studio.byId.useQuery(
 { id: reattachId ?? "00000000-0000-0000-0000-000000000000" },
 {
 enabled: open && !!reattachId,
 refetchInterval: (query) => {
 const data = query.state.data;
 if (!data) return 1500;
 if (data.status === "generating") return 1500;
 return false;
 },
 },
 );

 useEffect(() => {
 if (!reattachId) return;
 const row = reattachQuery.data;
 if (!row) return;

 // Reconstruct the modal state from the persisted snapshot.
 if (row.status === "ready" && row.assetUrl) {
 setStage("done");
 setStageMsg("Done!");
 setAudioUrl(row.assetUrl);
 const c = row.content as { script?: ScriptLine[] } | null;
 if (c?.script) setScript(c.script);
 utils.studio.list.invalidate({ notebookId });
 return;
 }
 if (row.status === "error") {
 setStage("error");
 const c = row.content as { error?: string } | null;
 setErrMsg(c?.error ?? "Generation failed.");
 return;
 }
 if (row.status === "cancelled") {
 setStage("cancelled");
 return;
 }
 // Still generating — translate the persisted progress snapshot
 // into the same Stage/stageMsg/ttsProgress state shape that the
 // streaming run() path uses, so the existing UI components don't
 // need a second code path.
 const p = row.progress as ProgressSnapshot | null;
 if (!p) return;
 const stageMap: Record<string, Stage> = {
 starting: "generating-script",
 script: "generating-script",
 "converting-tts": "converting-tts",
 combine: "combining",
 upload: "uploading",
 };
 const mapped = p.stage ? stageMap[p.stage] : undefined;
 if (mapped) setStage(mapped);
 if (p.message) setStageMsg(p.message);
 if (typeof p.ttsCompleted === "number" && typeof p.ttsTotal === "number") {
 setTtsProgress({ index: p.ttsCompleted, total: p.ttsTotal });
 }
 }, [reattachId, reattachQuery.data, utils, notebookId]);

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
 ttsProvider,
 }),
 signal: ctrl.signal,
 });

 if (!res.ok || !res.body) {
 // We can only consume the body once. Read it as text first so we
 // *always* have something to show — then opportunistically try to
 // parse JSON for the structured `{ error, available }` shape the
 // server returns from provider-config failures.
 const rawBody = await res.text().catch(() => "");
 let parsedError: string | null = null;
 let parsedAvailable: TtsProvider[] | undefined;
 try {
 const body = JSON.parse(rawBody) as {
 error?: string;
 available?: TtsProvider[];
 };
 if (body?.error) {
 parsedError = body.error;
 parsedAvailable = body.available;
 }
 } catch {
 // not JSON — `rawBody` carries whatever the server sent.
 }

 // Always log the full response to the console so devtools shows
 // the actual server message even if the modal only renders a
 // short summary.
 // biome-ignore lint/suspicious/noConsole: error diagnostics
 console.error("[audio-overview] HTTP %d:", res.status, {
 statusText: res.statusText,
 body: rawBody,
 parsedError,
 parsedAvailable,
 });

 if (parsedError) {
 const avail = parsedAvailable?.length
 ? ` Available: ${parsedAvailable.join(", ")}.`
 : "";
 throw new Error(`${parsedError}${avail}`);
 }
 // No structured error — surface whatever the body said, falling
 // back to the status code so the user never sees a bare "HTTP 400".
 const detail = rawBody.trim().slice(0, 240);
 throw new Error(
 detail
 ? `HTTP ${res.status}: ${detail}`
 : `HTTP ${res.status} ${res.statusText || ""}`.trim(),
 );
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
 case "started": {
 // The server tells us the row id immediately so we can wire
 // the Cancel button against it.
 const d = evt.data as { id: string };
 setJobId(d.id);
 utils.studio.list.invalidate({ notebookId });
 break;
 }
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
 // Server emits {completed, total, index} now that segments
 // run on a sliding-window pool — the order of completion
 // doesn't match the order in the script. Show the count of
 // completed segments, not the index of the just-finished
 // one (which can jump around).
 const d = evt.data as {
 index: number;
 completed?: number;
 total: number;
 };
 const completed = d.completed ?? d.index + 1;
 setTtsProgress({ index: completed, total: d.total });
 setStageMsg(
 `Converting to audio (${completed}/${d.total})...`,
 );
 break;
 }
 case "tts-retry": {
 // A segment failed and is being retried. Surface so the
 // user knows progress hasn't stalled — it's deliberately
 // backing off and re-trying.
 const d = evt.data as {
 index: number;
 attempt: number;
 total: number;
 };
 setStageMsg(
 `Retrying segment ${d.index + 1}/${d.total} (attempt ${d.attempt})...`,
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
 utils.studio.list.invalidate({ notebookId });
 break;
 }
 case "cancelled": {
 setStage("cancelled");
 setStageMsg("Cancelled");
 utils.studio.list.invalidate({ notebookId });
 break;
 }
 }
 }
 }, [notebookId, length, focus, ttsProvider, reset, utils]);

 /**
 * Tell the server to cancel the in-flight job. We don't abort the
 * fetch here — the server itself will write the `cancelled` row
 * state and emit a `cancelled` event over the stream, after which
 * we (the modal) terminate naturally.
 */
 const cancelJob = useCallback(async () => {
 if (!jobId || cancelling) return;
 setCancelling(true);
 try {
 await fetch("/api/studio/cancel", {
 method: "POST",
 headers: { "Content-Type": "application/json" },
 body: JSON.stringify({ id: jobId }),
 });
 } catch {
 // Best-effort. The server might fail to receive the request,
 // in which case the polling loop in StudioPanel still sees the
 // row stuck on `generating` until the next reaper cycle.
 }
 }, [jobId, cancelling]);

 if (!open) return null;

 const running = stage !== "idle" && stage !== "done" && stage !== "error";
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
 className="absolute inset-0 bg-canvas/60 backdrop-blur-sm"
 onClick={() => {
 // Aborting only severs the streaming response — the server-
 // side handler already ignores `req.signal` for the heavy
 // work (script + TTS), so the audio still finishes and the
 // studio_outputs row flips to "ready" in the background.
 // Invalidating the studio list here makes the panel re-poll
 // so the "Generating..." indicator becomes a playable item
 // as soon as the row updates.
 abortRef.current?.abort();
 utils.studio.list.invalidate({ notebookId });
 onClose();
 }}
 />
 <div className="relative w-full max-w-lg bg-surface dark:bg-surface rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-border-subtle/50 dark:border-border-strong/50">
 {/* Gradient accent bar */}
 <div className="absolute inset-x-0 top-0 h-[3px] bg-[var(--ds-accent-gradient)]" />

 {/* Header */}
 <div className="flex items-center justify-between px-6 py-4 shrink-0">
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center shadow-lg shadow-accent/25">
 <span className="material-symbols-outlined text-xl text-white icon-filled">
 headphones
 </span>
 </div>
 <div>
 <h2 className="text-lg font-semibold text-fg-secondary dark:text-fg">
 Audio Overview
 </h2>
 <p className="text-xs text-fg-muted">
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
 className="p-2 rounded-full hover:bg-accent-soft dark:hover:bg-border-strong text-fg-muted hover:text-fg-secondary dark:hover:text-fg-secondary transition-colors"
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
 <label className="text-sm font-medium text-fg-secondary dark:text-fg-secondary mb-2 block">
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
 ? "bg-accent-soft border-fg-accent/40 text-fg-accent shadow-sm"
 : "bg-elevated dark:bg-elevated border-border-subtle dark:border-border-subtle text-fg-secondary dark:text-fg-muted hover:bg-accent-soft dark:hover:bg-border-strong"
 }`}
 >
 {opt.label}
 </button>
 ))}
 </div>
 </div>

 {/* TTS provider selector */}
 <div>
 <label className="text-sm font-medium text-fg-secondary dark:text-fg-secondary mb-2 block">
 Voice engine
 </label>
 <div className="flex gap-2">
 {TTS_OPTIONS.map((opt) => {
 const active = ttsProvider === opt.value;
 return (
 <button
 key={opt.value}
 type="button"
 onClick={() => setTtsProvider(opt.value)}
 title={opt.hint}
 className={`flex-1 px-3 py-2.5 rounded-xl text-sm font-medium transition-all border flex items-center justify-center gap-2 ${
 active
 ? "bg-accent-soft border-fg-accent/40 text-fg-accent shadow-sm"
 : "bg-elevated dark:bg-elevated border-border-subtle dark:border-border-subtle text-fg-secondary dark:text-fg-muted hover:bg-accent-soft dark:hover:bg-border-strong"
 }`}
 >
 <span className="material-symbols-outlined text-base">
 {opt.icon}
 </span>
 {opt.label}
 </button>
 );
 })}
 </div>
 <p className="mt-1.5 text-[11px] text-fg-muted leading-snug">
 {TTS_OPTIONS.find((o) => o.value === ttsProvider)?.hint}
 </p>
 </div>

 {/* Custom focus */}
 <div>
 <label className="text-sm font-medium text-fg-secondary dark:text-fg-secondary mb-2 block">
 Custom focus{" "}
 <span className="text-fg-muted font-normal">(optional)</span>
 </label>
 <input
 type="text"
 value={focus}
 onChange={(e) => setFocus(e.target.value)}
 placeholder="Focus on a specific topic (optional)"
 className="w-full px-4 py-3 rounded-xl border border-border-subtle bg-white dark:bg-elevated text-sm text-fg-secondary placeholder:text-fg-muted focus:ring-2 focus:ring-fg-accent/40 focus:border-fg-accent transition-shadow"
 />
 </div>

 {/* Generate button */}
 <button
 type="button"
 onClick={run}
 className="w-full py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white text-sm font-semibold transition-all shadow-md shadow-accent/25 flex items-center justify-center gap-2"
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
 ? "bg-fg-accent text-fg-on-accent animate-pulse"
 : "bg-border-subtle text-fg-muted"
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
 ? "text-fg-accent"
 : "text-fg-muted"
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
 : "bg-border-subtle"
 }`}
 />
 )}
 </div>
 );
 })}
 </div>

 {/* Stage message */}
 <div className="flex items-center gap-2 justify-center">
 <span className="material-symbols-outlined text-lg text-fg-accent animate-spin">
 progress_activity
 </span>
 <span className="text-sm font-medium text-fg-secondary dark:text-fg-muted">
 {stageMsg || STAGE_LABELS[stage] || "Processing..."}
 </span>
 </div>

 {/* TTS progress bar */}
 {stage === "converting-tts" && ttsProgress.total > 0 && (
 <div className="space-y-2">
 <div className="w-full h-2 bg-border-subtle rounded-full overflow-hidden">
 <div
 className="h-full bg-accent rounded-full transition-all duration-300"
 style={{ width: `${progressPct}%` }}
 />
 </div>
 <p className="text-xs text-center text-fg-muted">
 {ttsProgress.index} of {ttsProgress.total} segments
 </p>
 </div>
 )}

 {/* Cancel button — only available once the server has
 acknowledged the request with a row id. Closing the
 modal alone doesn't kill the work; this button does
 (cooperatively, between segments). */}
 {jobId && (
 <button
 type="button"
 onClick={cancelJob}
 disabled={cancelling}
 className="w-full py-2.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 text-danger text-sm font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
 >
 <span className="material-symbols-outlined text-base">
 {cancelling ? "progress_activity" : "stop_circle"}
 </span>
 {cancelling ? "Cancelling..." : "Cancel generation"}
 </button>
 )}
 </div>
 )}

 {/* Cancelled state */}
 {stage === "cancelled" && (
 <div className="space-y-4">
 <div className="flex flex-col items-center justify-center py-6 gap-3">
 <span className="material-symbols-outlined text-4xl text-fg-muted">
 cancel
 </span>
 <p className="text-sm text-fg-secondary dark:text-fg-secondary text-center">
 Generation cancelled.
 </p>
 </div>
 <button
 type="button"
 onClick={reset}
 className="w-full py-2.5 rounded-xl bg-border-subtle hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium text-fg-secondary dark:text-fg-secondary transition-colors"
 >
 Try Again
 </button>
 </div>
 )}

 {/* Error state */}
 {stage === "error" && (
 <div className="space-y-4">
 <div className="flex flex-col items-center justify-center py-6 gap-3">
 <span className="material-symbols-outlined text-4xl text-red-400">
 error
 </span>
 <p className="text-sm text-danger text-center max-w-full break-words whitespace-pre-wrap max-h-48 overflow-y-auto">
 {errMsg || "An error occurred during generation."}
 </p>
 {errMsg && (
 <p className="text-[10px] text-fg-muted text-center">
 See the developer console for the full server response.
 </p>
 )}
 </div>
 <button
 type="button"
 onClick={reset}
 className="w-full py-2.5 rounded-xl bg-border-subtle hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium text-fg-secondary dark:text-fg-secondary transition-colors"
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
 className="w-full py-2.5 rounded-xl bg-border-subtle hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-medium text-fg-secondary dark:text-fg-secondary transition-colors mt-2"
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
