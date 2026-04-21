"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useMemo, useState } from "react";

type Props = {
  notebookId: string;
  sourceIds: string[];
  sourceCount: number;
  onOpenUpload: () => void;
};

export function ChatPanel({
  notebookId,
  sourceIds,
  sourceCount,
  onOpenUpload,
}: Props) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: () => ({ notebookId, sourceIds }),
      }),
    [notebookId, sourceIds],
  );

  const { messages, sendMessage, status } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  const [input, setInput] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await sendMessage({ text });
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

      <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4 min-h-0">
        {messages.length === 0 && (
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

        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
              m.role === "user"
                ? "ml-auto bg-blue-600 text-white"
                : "bg-element-light dark:bg-element-dark text-gray-800 dark:text-gray-200"
            }`}
          >
            {(m.parts ?? [])
              .filter((p): p is { type: "text"; text: string } =>
                p.type === "text",
              )
              .map((p) => p.text)
              .join("")}
          </div>
        ))}

        {busy && (
          <div className="bg-element-light dark:bg-element-dark text-gray-500 rounded-2xl px-4 py-3 text-sm max-w-[30%] typing-indicator">
            <span>.</span>
            <span>.</span>
            <span>.</span>
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

