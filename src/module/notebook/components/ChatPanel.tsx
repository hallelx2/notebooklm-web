"use client";

import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { trpc } from "@/trpc/client";
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
      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-headings:my-2 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:bg-gray-100 dark:prose-pre:bg-gray-800 prose-pre:rounded-lg prose-code:text-blue-600 dark:prose-code:text-blue-400">
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
                    className={`inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold mx-0.5 align-middle hover:bg-indigo-700 hover:scale-110 transition-all ${
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
          className="fixed z-[60] w-80 bg-white dark:bg-[#1e1f20] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
          style={{
            top: popover.rect.bottom + 8,
            left: Math.min(popover.rect.left, window.innerWidth - 340),
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 border-b border-indigo-100 dark:border-indigo-500/20">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-bold shrink-0">
                {popover.n}
              </span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">
                {popover.title}
              </span>
            </div>
          </div>
          <div className="p-3 max-h-48 overflow-y-auto">
            <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-wrap">
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
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ notebookId, sourceIds }),
      }),
    [notebookId, sourceIds],
  );

  const { messages, sendMessage, status, setMessages } = useChat({
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
    <section className="flex-1 bg-surface-light dark:bg-surface-dark rounded-2xl flex flex-col border border-border-light dark:border-transparent shadow-sm overflow-hidden min-h-0">
      <div className="p-4 flex items-center justify-between shrink-0">
        <h2 className="font-medium text-gray-800 dark:text-gray-200">Chat</h2>
        <div className="flex gap-1">
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            title="Chat Settings"
          >
            <span className="material-symbols-outlined">tune</span>
          </button>
          <button
            type="button"
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
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
            <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
              <span className="material-symbols-outlined">upload_file</span>
            </div>
            <h3 className="text-xl font-medium mb-2 text-gray-800 dark:text-white">
              Add a source to get started
            </h3>
            <button
              type="button"
              onClick={onOpenUpload}
              className="mt-4 px-6 py-2 bg-element-light dark:bg-element-dark hover:bg-gray-200 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-full text-sm font-medium transition-colors"
            >
              Upload a source
            </button>
          </div>
        )}

        {messages.length === 0 && sourceCount > 0 && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-full max-w-md rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 p-8 text-center border border-blue-100/50 dark:border-blue-800/30">
              {notebookTitle === "Untitled notebook" ? (
                <div className="w-48 h-7 bg-white/30 dark:bg-white/10 rounded-lg animate-pulse mx-auto mb-3" />
              ) : (
                <h3 className="text-2xl font-semibold mb-3 text-gray-800 dark:text-white">
                  {notebookTitle}
                </h3>
              )}
              {notebookDescription ? (
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-6">
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
                    className="w-full text-left px-4 py-2.5 rounded-xl bg-white/70 dark:bg-white/5 hover:bg-white dark:hover:bg-white/10 border border-gray-200/60 dark:border-gray-700/50 text-sm text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px] align-middle mr-2 text-blue-500 dark:text-blue-400">
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
              <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-element-light dark:bg-element-dark text-gray-800 dark:text-gray-200">
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
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
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
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
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
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
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
          <div className="max-w-[85%] rounded-2xl px-4 py-4 bg-element-light dark:bg-element-dark animate-pulse space-y-2.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-600 rounded" />
            </div>
            <div className="h-3 w-full bg-gray-200 dark:bg-gray-600 rounded" />
            <div className="h-3 w-5/6 bg-gray-200 dark:bg-gray-600 rounded" />
            <div className="h-3 w-4/6 bg-gray-200 dark:bg-gray-600 rounded" />
          </div>
        )}

        {busy && messages.length > 0 && messages[messages.length - 1].role === "user" && (
          <div className="max-w-[85%] rounded-2xl px-4 py-4 bg-element-light dark:bg-element-dark space-y-2.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <div className="h-3 w-24 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            </div>
            <div className="h-3 w-full bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-3 w-5/6 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
            <div className="h-3 w-3/6 bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="p-4 shrink-0 border-t border-gray-100 dark:border-gray-800"
      >
        <div className="bg-element-light dark:bg-element-dark rounded-3xl p-4 flex flex-col gap-2 border border-transparent focus-within:border-gray-300 dark:focus-within:border-gray-500 transition-colors">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            className="w-full bg-transparent border-none focus:ring-0 p-0 text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-500 outline-none disabled:opacity-60"
            placeholder={
              sourceCount === 0
                ? "Add a source to start chatting..."
                : "Ask anything about your sources..."
            }
            type="text"
          />
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-400 dark:text-gray-500">
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
                  : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
              }`}
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>
        </div>
        <div className="text-center mt-1.5">
          <p className="text-[10px] text-gray-400 dark:text-gray-600">
            NotebookLM can be inaccurate; please double-check its responses.
          </p>
        </div>
      </form>
    </section>
  );
}
