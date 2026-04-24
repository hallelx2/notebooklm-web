"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { ChatPanel } from "../components/ChatPanel";
import { DeepResearchModal } from "../components/DeepResearchModal";
import { ResizeHandle } from "../components/ResizeHandle";
import { SourcesPanel } from "../components/SourcesPanel";
import { StudioPanel } from "../components/StudioPanel";
import { showToast, Toast } from "../components/Toast";
import { UploadModal } from "../components/UploadModal";

export function NotebookView({ id }: { id: string }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  const q = trpc.notebook.byId.useQuery(
    { id },
    { enabled: !!session?.user, refetchInterval: 4000 },
  );
  const sourcesQ = trpc.source.list.useQuery(
    { notebookId: id },
    { enabled: !!session?.user, refetchInterval: 2500 },
  );

  const [sourcesWidth, setSourcesWidth] = useState(320);
  const [studioWidth, setStudioWidth] = useState(320);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deepOpen, setDeepOpen] = useState(false);
  const [deepQuery, setDeepQuery] = useState<string | undefined>(undefined);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const addFromText = trpc.source.addFromText.useMutation({
    onSuccess: () => {
      utils.source.list.invalidate({ notebookId: id });
      setNoteOpen(false);
      setNoteText("");
      showToast("Note saved");
    },
  });
  const utils = trpc.useUtils();

  function handleSaveNote() {
    const text = noteText.trim();
    if (!text) return;
    const title = text.slice(0, 60).replace(/\n/g, " ") + (text.length > 60 ? "..." : "");
    addFromText.mutate({
      notebookId: id,
      title: `Note: ${title}`,
      text,
      kind: "note",
    });
  }

  /** Called when a mindmap node is clicked – sends a contextual question to chat */
  const handleMindmapNodeClick = useCallback((nodeText: string) => {
    setChatPrompt(
      `Explain the concept "${nodeText}" in detail based on the documents we have available.`,
    );
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboard") === "1") {
      setUploadOpen(true);
      params.delete("onboard");
      const next = params.toString();
      const url = `${window.location.pathname}${next ? `?${next}` : ""}`;
      window.history.replaceState({}, "", url);
    }
  }, []);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.replace("/auth/sign-in");
    }
  }, [isPending, session, router]);

  if (isPending || !session?.user || q.isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-500">
        Loading notebook...
      </main>
    );
  }

  if (!q.data) {
    return (
      <main className="min-h-screen flex items-center justify-center flex-col gap-3">
        <p>Notebook not found.</p>
        <Link href="/notebooks" className="text-blue-600 hover:underline">
          Back to notebooks
        </Link>
      </main>
    );
  }

  const n = q.data;
  const sources = sourcesQ.data ?? [];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
      <header className="h-16 flex items-center justify-between px-4 shrink-0 bg-background-light dark:bg-background-dark">
        <div className="flex items-center gap-4">
          <Link
            href="/notebooks"
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title="Back"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold">
              <span className="material-symbols-outlined text-xl">book_2</span>
            </div>
            {n.title === "Untitled notebook" ? (
              <span className="inline-block w-40 h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            ) : (
              <span className="text-lg font-medium text-gray-700 dark:text-gray-200">
                {n.title}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => showToast("Analytics coming soon")}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title="Analytics"
          >
            <span className="material-symbols-outlined">trending_up</span>
          </button>
          <button
            type="button"
            onClick={() => showToast("Share coming soon")}
            className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors border border-transparent hover:border-gray-300 dark:hover:border-gray-600"
            title="Share"
          >
            <span className="material-symbols-outlined text-lg">share</span>
            <span className="text-sm">Share</span>
          </button>
          <button
            type="button"
            onClick={() => showToast("Settings coming soon")}
            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
            title="Settings"
          >
            <span className="material-symbols-outlined">settings</span>
          </button>
          <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm ml-2 cursor-pointer">
            {(session.user.name ?? session.user.email)
              .slice(0, 2)
              .toUpperCase()}
          </div>
        </div>
      </header>

      <main className="flex-1 flex px-3 pb-3 overflow-hidden">
        <aside
          className="panel-resizable bg-surface-light dark:bg-surface-dark rounded-2xl flex flex-col border border-border-light dark:border-transparent shadow-sm shrink-0"
          style={{ width: sourcesWidth }}
        >
          <SourcesPanel
            notebookId={id}
            onOpenUpload={() => setUploadOpen(true)}
            onOpenDeepResearch={(q) => {
              setDeepQuery(q);
              setDeepOpen(true);
            }}
            selectedSourceIds={selectedSourceIds}
            setSelectedSourceIds={setSelectedSourceIds}
          />
        </aside>

        <ResizeHandle
          side="right"
          width={sourcesWidth}
          setWidth={setSourcesWidth}
        />

        <ChatPanel
          notebookId={id}
          sourceIds={selectedSourceIds}
          sourceCount={sources.length}
          notebookTitle={n.title}
          notebookDescription={n.description}
          onOpenUpload={() => setUploadOpen(true)}
          externalPrompt={chatPrompt}
          onExternalPromptConsumed={() => setChatPrompt(null)}
        />

        <ResizeHandle
          side="left"
          width={studioWidth}
          setWidth={setStudioWidth}
        />

        <aside
          className="panel-resizable bg-surface-light dark:bg-surface-dark rounded-2xl flex flex-col border border-border-light dark:border-transparent shadow-sm shrink-0"
          style={{ width: studioWidth }}
        >
          <StudioPanel
            notebookId={id}
            onMindmapNodeClick={handleMindmapNodeClick}
          />
        </aside>
      </main>

      {/* Add Note floating button + modal */}
      <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none z-40">
        <button
          type="button"
          onClick={() => {
            setNoteOpen(true);
            setTimeout(() => noteRef.current?.focus(), 100);
          }}
          className="pointer-events-auto shadow-lg flex items-center gap-2 px-5 py-3 bg-gray-900 dark:bg-white text-white dark:text-black rounded-full font-medium hover:scale-105 transition-transform"
        >
          <span className="material-symbols-outlined text-lg">edit_note</span>
          Add note
        </button>
      </div>

      {noteOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center pb-24 px-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-gray-900/30 backdrop-blur-sm"
            onClick={() => setNoteOpen(false)}
          />
          <div className="relative w-full max-w-lg bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl border border-border-light dark:border-border-dark overflow-hidden">
            <div className="p-4 border-b border-border-light dark:border-border-dark flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-indigo-500">
                  edit_note
                </span>
                New Note
              </h3>
              <button
                type="button"
                onClick={() => setNoteOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="p-4">
              <textarea
                ref={noteRef}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your note here... This will be added as a source for your notebook."
                className="w-full h-32 bg-element-light dark:bg-element-dark border border-border-light dark:border-border-dark rounded-xl p-3 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
              />
              <div className="flex items-center justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setNoteOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={!noteText.trim() || addFromText.isPending}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50"
                >
                  {addFromText.isPending ? "Saving..." : "Save note"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        notebookId={id}
      />
      <DeepResearchModal
        open={deepOpen}
        onClose={() => setDeepOpen(false)}
        notebookId={id}
        initialQuery={deepQuery}
      />
      <Toast />
    </div>
  );
}
