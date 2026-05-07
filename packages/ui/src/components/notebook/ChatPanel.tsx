"use client";

import { type UIMessage, useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
 type ReactNode,
 useCallback,
 useEffect,
 useMemo,
 useRef,
 useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTransport } from "../../contexts/transport";
import { trpc } from "../../trpc/client";
import { showToast } from "./Toast";

/* ── Citation types ─────────────────────────────────────────── */
type CitationEntry = {
 title: string;
 snippet: string;
 sourceId: string;
};
type CitationLookup = Record<number, CitationEntry>;
type CitationsMap = Map<string, CitationLookup>;

const STARTER_QUESTIONS = [
 "Summarize the key points",
 "What are the main themes?",
 "Create a study plan",
];

/**
 * Convert citation markers into inline code so ReactMarkdown renders them as badges.
 * Handles: [^1], [1], [^1, ^6], [1, 2, 5], [^1, ^2, ^5] etc.
 */
function preprocessMarkdown(text: string): string {
 // First, expand grouped citations like [^1, ^6] or [1, 2, 5] into individual badges
 const expanded = text.replace(
 /\[(\^?\d{1,2}(?:\s*,\s*\^?\d{1,2})*)\]/g,
 (_, inner: string) => {
 const nums = inner.split(",").map((s) => s.trim().replace(/^\^/, ""));
 return nums.map((n) => `\`[${n}]\``).join(" ");
 },
 );
 return expanded;
}

/* ── ChatErrorBanner ───────────────────────────────────────────
 *
 * Surfaces useChat errors with the postgres / drizzle reason
 * actually visible. Drizzle wraps DB errors with a `Failed query:
 * <SQL>` template that, on its own, hides the actual postgres
 * message in `cause`. Walk the cause chain to surface the real
 * reason at the top, and stash the SQL behind a collapsible
 * <details> so the page isn't dominated by 768-dim vector dumps.
 */
function ChatErrorBanner({ err }: { err: unknown }) {
 // Walk the cause chain (Error.cause is standard since ES2022).
 // Stop at the first frame whose message DOESN'T look like a
 // drizzle "Failed query:" wrapper — that's the actual reason.
 const chain: { message: string; isWrapper: boolean }[] = [];
 // biome-ignore lint/suspicious/noExplicitAny: walking unknown error chain
 let cur: any = err;
 const seen = new Set<unknown>();
 while (cur && !seen.has(cur)) {
 seen.add(cur);
 const message = typeof cur === "string" ? cur : (cur.message ?? String(cur));
 const isWrapper =
 typeof message === "string" && message.startsWith("Failed query:");
 chain.push({ message, isWrapper });
 cur = (cur as { cause?: unknown }).cause;
 }

 // Headline = first non-wrapper message, or the top-level message
 // if the chain is wrappers all the way down.
 const headline =
 chain.find((c) => !c.isWrapper)?.message ?? chain[0]?.message ?? String(err);
 // Diagnostic = anything else worth showing — the SQL, deeper causes, etc.
 const diagnostics = chain
 .filter((c, i) => c.message !== headline || i > 0)
 .map((c) => c.message);

 return (
 <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-danger/10 border border-danger/40">
 <div className="flex items-center gap-2 mb-1.5">
 <span className="material-symbols-outlined text-[16px] text-danger">
 error
 </span>
 <span className="text-xs font-bold uppercase tracking-widest text-danger">
 Chat error
 </span>
 </div>
 <p className="text-sm text-danger leading-relaxed break-words">
 {headline}
 </p>
 <p className="text-[11px] text-fg-muted mt-2">
 If this persists, open Settings → Providers and re-test the chat
 provider, or Settings → Models to confirm the embedding model
 matches the chunks already stored.
 </p>
 {diagnostics.length > 0 && (
 <details className="mt-2">
 <summary className="text-[11px] font-bold uppercase tracking-widest text-fg-muted cursor-pointer hover:text-fg-secondary">
 Technical details
 </summary>
 <pre className="mt-2 max-h-48 overflow-y-auto text-[10px] text-fg-muted whitespace-pre-wrap break-words font-mono leading-relaxed bg-elevated rounded-lg p-2 border border-border-subtle">
 {diagnostics.join("\n\n")}
 </pre>
 </details>
 )}
 </div>
 );
}

/* ── AssistantMessage with clickable citation popovers ─────── */
function AssistantMessage({
 messageId,
 text,
 citationsMap,
 isStreaming,
 children,
}: {
 messageId: string;
 text: string;
 citationsMap: CitationsMap;
 isStreaming: boolean;
 children?: ReactNode;
}) {
 const [popover, setPopover] = useState<{
 n: number;
 title: string;
 snippet: string;
 rect: DOMRect;
 } | null>(null);

 // Close popover on outside click
 useEffect(() => {
 if (!popover) return;
 function close() {
 setPopover(null);
 }
 document.addEventListener("mousedown", close);
 return () => document.removeEventListener("mousedown", close);
 }, [popover]);

 // Close popover on scroll (the fixed popover would drift)
 useEffect(() => {
 if (!popover) return;
 function close() {
 setPopover(null);
 }
 window.addEventListener("scroll", close, true);
 return () => window.removeEventListener("scroll", close, true);
 }, [popover]);

 function handleCitationClick(n: number, event: React.MouseEvent) {
 event.stopPropagation();
 const lookup = citationsMap.get(messageId);
 if (!lookup?.[n]) return;
 const rect = (event.target as HTMLElement).getBoundingClientRect();
 setPopover({ n, title: lookup[n].title, snippet: lookup[n].snippet, rect });
 }

 return (
 <div className="relative">
 <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:bg-accent-soft dark:prose-pre:bg-elevated prose-pre:rounded-lg prose-code:text-blue-600 dark:prose-code:text-fg-accent">
 <ReactMarkdown
 remarkPlugins={[remarkGfm]}
 components={{
 code: ({ children: codeChildren, className }) => {
 const raw = String(codeChildren);
 const cite = raw.match(/^\[(\d{1,2})\]$/);
 if (cite && !className) {
 const n = parseInt(cite[1]);
 const lookup = citationsMap.get(messageId);
 const hasCitation = !!lookup?.[n];
 return (
 <span
 onClick={(e) => handleCitationClick(n, e)}
 onMouseDown={(e) => e.stopPropagation()}
 className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-fg-accent text-white text-[10px] font-bold mx-0.5 align-middle hover:bg-accent-hover hover:scale-110 transition-all ${
 hasCitation ? "cursor-pointer" : "cursor-help"
 }`}
 title={
 hasCitation
 ? `Source ${n} — click to view`
 : `Source ${n}`
 }
 >
 {n}
 </span>
 );
 }
 return <code className={className}>{codeChildren}</code>;
 },
 }}
 >
 {preprocessMarkdown(text)}
 </ReactMarkdown>
 </div>

 {isStreaming && (
 <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse ml-1 align-middle" />
 )}

 {/* Citation popover */}
 {popover && (
 <div
 className="fixed z-[60] w-80 bg-elevated rounded-xl shadow-2xl border border-border-subtle overflow-hidden"
 style={{
 top: popover.rect.bottom + 8,
 left: Math.min(popover.rect.left, window.innerWidth - 340),
 }}
 onMouseDown={(e) => e.stopPropagation()}
 >
 <div className="p-3 bg-accent-soft border-b border-fg-accent/20">
 <div className="flex items-center gap-2">
 <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-fg-accent text-white text-[10px] font-bold shrink-0">
 {popover.n}
 </span>
 <span className="text-sm font-semibold text-fg-secondary truncate">
 {popover.title}
 </span>
 </div>
 </div>
 <div className="p-3 max-h-48 overflow-y-auto">
 <p className="text-xs text-fg-muted leading-relaxed whitespace-pre-wrap">
 {popover.snippet}
 </p>
 </div>
 </div>
 )}

 {/* Pass through action buttons */}
 {children}
 </div>
 );
}

type Props = {
 notebookId: string;
 sourceIds: string[];
 sourceCount: number;
 notebookTitle: string;
 notebookDescription: string | null;
 onOpenUpload: () => void;
 /** External prompt to auto-submit (e.g. from mindmap node click) */
 externalPrompt?: string | null;
 /** Callback to clear the external prompt after it's been consumed */
 onExternalPromptConsumed?: () => void;
};

export function ChatPanel({
 notebookId,
 sourceIds,
 sourceCount,
 notebookTitle,
 notebookDescription,
 onOpenUpload,
 externalPrompt,
 onExternalPromptConsumed,
}: Props) {
 const utils = trpc.useUtils();
 const scrollRef = useRef<HTMLDivElement>(null);

 // ─── Load persisted messages from DB ───────────────────────
 const historyQ = trpc.message.list.useQuery({ notebookId });
 const initialMessages = useMemo<UIMessage[]>(() => {
 if (!historyQ.data || historyQ.data.length === 0) return [];
 // DB returns newest first — reverse to oldest first
 const rows = [...historyQ.data].reverse();
 return rows.map((r) => ({
 id: r.id,
 role: r.role as "user" | "assistant",
 parts: [{ type: "text" as const, text: r.content }],
 createdAt: new Date(r.createdAt),
 }));
 }, [historyQ.data]);

 // ─── Build citation lookup: messageId → { [n]: CitationEntry } ──
 const citationsMap = useMemo<CitationsMap>(() => {
 const map: CitationsMap = new Map();
 if (!historyQ.data) return map;
 for (const msg of historyQ.data) {
 if (msg.citations && Array.isArray(msg.citations)) {
 const lookup: CitationLookup = {};
 for (const c of msg.citations as {
 n: number;
 title: string;
 snippet: string;
 sourceId: string;
 }[]) {
 lookup[c.n] = {
 title: c.title,
 snippet: c.snippet,
 sourceId: c.sourceId,
 };
 }
 map.set(msg.id, lookup);
 }
 }
 return map;
 }, [historyQ.data]);

 // ─── Chat transport + hook ─────────────────────────────────
 const transportCtx = useTransport();
 const transport = useMemo(
 () =>
 new DefaultChatTransport({
 api: transportCtx.chat.url,
 body: () => ({ notebookId, sourceIds }),
 }),
 [notebookId, sourceIds, transportCtx.chat.url],
 );

 const { messages, sendMessage, status, setMessages, error } = useChat({
 transport,
 });
 const busy = status === "submitted" || status === "streaming";

 // Seed chat with persisted messages once loaded
 const seeded = useRef(false);
 useEffect(() => {
 if (!seeded.current && initialMessages.length > 0) {
 seeded.current = true;
 setMessages(initialMessages);
 }
 }, [initialMessages, setMessages]);

 // After streaming finishes, refetch messages to get fresh citations
 const prevStatus = useRef(status);
 useEffect(() => {
 if (prevStatus.current === "streaming" && status === "ready") {
 utils.message.list.invalidate({ notebookId });
 }
 prevStatus.current = status;
 }, [status, utils.message.list, notebookId]);

 // Auto-scroll on new messages
 useEffect(() => {
 if (scrollRef.current) {
 scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
 }
 }, [messages, busy]);

 const [input, setInput] = useState("");

 const submitText = useCallback(
 async (text: string) => {
 if (!text || busy) return;
 setInput("");
 await sendMessage({ text });
 },
 [busy, sendMessage],
 );

 // Handle external prompts (e.g. from mindmap node clicks)
 const prevExternalPrompt = useRef<string | null>(null);
 useEffect(() => {
 if (
 externalPrompt &&
 externalPrompt !== prevExternalPrompt.current &&
 !busy
 ) {
 prevExternalPrompt.current = externalPrompt;
 submitText(externalPrompt);
 onExternalPromptConsumed?.();
 }
 }, [externalPrompt, busy, submitText, onExternalPromptConsumed]);

 async function onSubmit(e: React.FormEvent) {
 e.preventDefault();
 await submitText(input.trim());
 }

 function handleStarterClick(question: string) {
 setInput(question);
 submitText(question);
 }

 // ─── Message actions: Add as Source / Save as Note ─────────
 const addFromText = trpc.source.addFromText.useMutation({
 onSuccess: () => {
 utils.source.list.invalidate({ notebookId });
 },
 });

 function handleAddAsSource(text: string) {
 const title = text.slice(0, 60).replace(/\n/g, " ").trim() + "...";
 addFromText.mutate(
 {
 notebookId,
 title: `Chat: ${title}`,
 text,
 kind: "text",
 },
 {
 onSuccess: () => showToast("Added as source"),
 onError: (err) => showToast(err.message),
 },
 );
 }

 function handleSaveAsNote(text: string) {
 const title = text.slice(0, 60).replace(/\n/g, " ").trim() + "...";
 addFromText.mutate(
 {
 notebookId,
 title: `Note: ${title}`,
 text,
 kind: "note",
 },
 {
 onSuccess: () => showToast("Saved as note"),
 onError: (err) => showToast(err.message),
 },
 );
 }

 return (
 <section className="flex-1 bg-surface rounded-2xl flex flex-col border border-border-subtle dark:border-transparent shadow-sm overflow-hidden min-h-0">
 <div className="p-4 flex items-center justify-between shrink-0">
 <h2 className="font-medium text-fg-secondary">Chat</h2>
 <div className="flex gap-1">
 <button
 type="button"
 className="p-1 rounded hover:bg-accent-soft dark:hover:bg-border-strong text-fg-muted"
 title="Chat Settings"
 >
 <span className="material-symbols-outlined">tune</span>
 </button>
 <button
 type="button"
 className="p-1 rounded hover:bg-accent-soft dark:hover:bg-border-strong text-fg-muted"
 >
 <span className="material-symbols-outlined">more_vert</span>
 </button>
 </div>
 </div>

 <div
 ref={scrollRef}
 className="flex-1 flex flex-col overflow-y-auto p-4 gap-4 min-h-0"
 >
 {messages.length === 0 && sourceCount === 0 && (
 <div className="flex-1 flex flex-col items-center justify-center p-8">
 <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-fg-accent mb-4">
 <span className="material-symbols-outlined">upload_file</span>
 </div>
 <h3 className="text-xl font-medium mb-2 text-fg-secondary dark:text-white">
 Add a source to get started
 </h3>
 <button
 type="button"
 onClick={onOpenUpload}
 className="mt-4 px-6 py-2 bg-elevated hover:bg-border-subtle dark:hover:bg-border-strong border border-border-subtle rounded-full text-sm font-medium transition-colors"
 >
 Upload a source
 </button>
 </div>
 )}

 {messages.length === 0 && sourceCount > 0 && (
 <div className="flex-1 flex flex-col items-center justify-center p-8">
 <div className="w-full max-w-md rounded-2xl bg-accent-soft p-8 text-center border border-fg-accent/20">
 {notebookTitle === "Untitled notebook" ? (
 <div className="w-48 h-7 bg-white/30 dark:bg-white/10 rounded-lg animate-pulse mx-auto mb-3" />
 ) : (
 <h3 className="text-2xl font-semibold mb-3 text-fg-secondary dark:text-white">
 {notebookTitle}
 </h3>
 )}
 {notebookDescription ? (
 <p className="text-sm text-fg-muted leading-relaxed mb-6">
 {notebookDescription}
 </p>
 ) : (
 <div className="space-y-2 mb-6">
 <div className="w-full h-4 bg-white/30 dark:bg-white/10 rounded animate-pulse" />
 <div className="w-3/4 h-4 bg-white/30 dark:bg-white/10 rounded animate-pulse mx-auto" />
 </div>
 )}
 <div className="flex flex-col gap-2">
 {STARTER_QUESTIONS.map((question) => (
 <button
 key={question}
 type="button"
 onClick={() => handleStarterClick(question)}
 disabled={busy}
 className="w-full text-left px-4 py-2.5 rounded-xl bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-border-subtle/60 dark:border-border-strong/50 text-sm text-fg-secondary transition-colors disabled:opacity-50"
 >
 <span className="material-symbols-outlined text-[16px] align-middle mr-2 text-blue-500 dark:text-fg-accent">
 arrow_forward
 </span>
 {question}
 </button>
 ))}
 </div>
 </div>
 </div>
 )}

 {messages.map((m) => {
 const text = (m.parts ?? [])
 .filter(
 (p): p is { type: "text"; text: string } => p.type === "text",
 )
 .map((p) => p.text)
 .join("");

 if (m.role === "user") {
 return (
 <div
 key={m.id}
 className="max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ml-auto bg-blue-600 text-white"
 >
 {text}
 </div>
 );
 }

 // Assistant message with clickable citation popovers
 const isStreamingThis =
 status === "streaming" &&
 m.id === messages[messages.length - 1]?.id;

 return (
 <div key={m.id} className="max-w-[85%] group/msg">
 <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-elevated text-fg-secondary">
 <AssistantMessage
 messageId={m.id}
 text={text}
 citationsMap={citationsMap}
 isStreaming={isStreamingThis}
 />
 </div>
 {/* Action buttons — appear on hover */}
 {text && (
 <div className="flex items-center gap-1 mt-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
 <button
 type="button"
 onClick={() => handleSaveAsNote(text)}
 disabled={addFromText.isPending}
 className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-fg-muted hover:bg-accent-soft dark:hover:bg-border-strong hover:text-fg-secondary transition-colors disabled:opacity-50"
 title="Save as note"
 >
 <span className="material-symbols-outlined text-[14px]">
 edit_note
 </span>
 Save as note
 </button>
 <button
 type="button"
 onClick={() => handleAddAsSource(text)}
 disabled={addFromText.isPending}
 className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-fg-muted hover:bg-accent-soft dark:hover:bg-border-strong hover:text-fg-secondary transition-colors disabled:opacity-50"
 title="Add as source"
 >
 <span className="material-symbols-outlined text-[14px]">
 add_circle
 </span>
 Add as source
 </button>
 <button
 type="button"
 onClick={() => {
 navigator.clipboard.writeText(text);
 showToast("Copied to clipboard");
 }}
 className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-fg-muted hover:bg-accent-soft dark:hover:bg-border-strong hover:text-fg-secondary transition-colors"
 title="Copy"
 >
 <span className="material-symbols-outlined text-[14px]">
 content_copy
 </span>
 Copy
 </button>
 </div>
 )}
 </div>
 );
 })}

 {busy && messages.length === 0 && (
 <div className="max-w-[85%] rounded-2xl px-4 py-4 bg-elevated animate-pulse space-y-2.5">
 <div className="flex items-center gap-2 mb-1">
 <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
 <div className="h-3 w-24 bg-border-subtle dark:bg-gray-600 rounded" />
 </div>
 <div className="h-3 w-full bg-border-subtle dark:bg-gray-600 rounded" />
 <div className="h-3 w-5/6 bg-border-subtle dark:bg-gray-600 rounded" />
 <div className="h-3 w-4/6 bg-border-subtle dark:bg-gray-600 rounded" />
 </div>
 )}

 {busy &&
 messages.length > 0 &&
 messages[messages.length - 1].role === "user" && (
 <div className="max-w-[85%] rounded-2xl px-4 py-4 bg-elevated space-y-2.5">
 <div className="flex items-center gap-2 mb-1">
 <span className="inline-block w-2 h-2 rounded-full bg-fg-accent animate-pulse" />
 <div className="h-3 w-24 bg-border-subtle rounded animate-pulse" />
 </div>
 <div className="h-3 w-full bg-border-subtle rounded animate-pulse" />
 <div className="h-3 w-5/6 bg-border-subtle rounded animate-pulse" />
 <div className="h-3 w-3/6 bg-border-subtle rounded animate-pulse" />
 </div>
 )}

 {/* Surface chat-stream errors so silent failures don't read as
     "no output" — until this was added a misconfigured AI provider
     (or a chat-endpoint 5xx in dev) just left the user staring
     at an empty assistant slot with no way to know what went wrong.
     Walk the error-cause chain because drizzle wraps postgres
     errors with a `Failed query: ...` template that hides the
     actual postgres reason in `cause`. */}
 {error && !busy && <ChatErrorBanner err={error} />}
 </div>

 <form
 onSubmit={onSubmit}
 className="p-4 shrink-0 border-t border-gray-100 dark:border-gray-800"
 >
 <div className="bg-elevated rounded-3xl p-4 flex flex-col gap-2 border border-transparent focus-within:border-border-subtle dark:focus-within:border-gray-500 transition-colors">
 <input
 value={input}
 onChange={(e) => setInput(e.target.value)}
 disabled={busy}
 className="w-full bg-transparent border-none focus:ring-0 p-0 text-fg placeholder:text-fg-muted dark:placeholder:text-fg-muted outline-none disabled:opacity-60"
 placeholder={
 sourceCount === 0
 ? "Add a source to start chatting..."
 : "Ask anything about your sources..."
 }
 type="text"
 />
 <div className="flex items-center justify-between">
 <div className="text-xs text-fg-muted">
 {sourceIds.length > 0
 ? `${sourceIds.length} selected / ${sourceCount} sources`
 : `${sourceCount} sources`}
 </div>
 <button
 type="submit"
 disabled={!input.trim() || busy}
 className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
 input.trim() && !busy
 ? "bg-blue-600 text-white hover:bg-blue-700"
 : "bg-border-subtle text-fg-muted cursor-not-allowed"
 }`}
 >
 <span className="material-symbols-outlined">arrow_forward</span>
 </button>
 </div>
 </div>
 <div className="text-center mt-1.5">
 <p className="text-[10px] text-fg-muted dark:text-fg-secondary">
 NotebookLM can be inaccurate; please double-check its responses.
 </p>
 </div>
 </form>
 </section>
 );
}
