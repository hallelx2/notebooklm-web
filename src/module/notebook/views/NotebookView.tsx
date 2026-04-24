"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut, useSession } from "@/lib/auth-client";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
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

  const [mobileTab, setMobileTab] = useState<"sources" | "chat" | "studio">("chat");
  const [sourcesWidth, setSourcesWidth] = useState(320);
  const [studioWidth, setStudioWidth] = useState(320);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deepOpen, setDeepOpen] = useState(false);
  const [deepQuery, setDeepQuery] = useState<string | undefined>(undefined);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [chatPrompt, setChatPrompt] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");

  const analyticsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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

  const updateNotebook = trpc.notebook.update.useMutation({
    onSuccess: () => {
      utils.notebook.byId.invalidate({ id });
      setEditTitle("");
      setSettingsOpen(false);
      showToast("Notebook renamed");
    },
    onError: (err) => showToast(err.message),
  });

  const deleteNotebook = trpc.notebook.delete.useMutation({
    onSuccess: () => {
      showToast("Notebook deleted");
      router.push("/notebooks");
    },
    onError: (err) => showToast(err.message),
  });

  function handleRename() {
    const title = editTitle.trim();
    if (!title) return;
    updateNotebook.mutate({ id, title });
  }

  function handleDeleteNotebook() {
    if (!confirm("Are you sure you want to delete this notebook? This action cannot be undone.")) return;
    deleteNotebook.mutate({ id });
  }

  // Close all dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        analyticsOpen &&
        analyticsRef.current &&
        !analyticsRef.current.contains(e.target as Node)
      ) {
        setAnalyticsOpen(false);
      }
      if (
        settingsOpen &&
        settingsRef.current &&
        !settingsRef.current.contains(e.target as Node)
      ) {
        setSettingsOpen(false);
      }
      if (
        profileOpen &&
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [analyticsOpen, settingsOpen, profileOpen]);

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
      <div className="h-screen flex flex-col overflow-hidden bg-background-light dark:bg-background-dark">
        {/* Skeleton header */}
        <div className="h-16 flex items-center px-4 gap-4 shrink-0 animate-pulse">
          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
        {/* Skeleton panels */}
        <div className="flex-1 flex px-3 pb-3 gap-2 overflow-hidden">
          {/* Sources skeleton */}
          <div className="w-[320px] shrink-0 bg-surface-light dark:bg-surface-dark rounded-2xl p-4 animate-pulse space-y-3">
            <div className="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-10 w-full bg-gray-200 dark:bg-gray-700 rounded-full" />
            <div className="h-20 w-full bg-gray-200 dark:bg-gray-700 rounded-xl" />
            <div className="space-y-2 mt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="w-5 h-5 bg-gray-200 dark:bg-gray-700 rounded" />
                  <div className="flex-1 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
                </div>
              ))}
            </div>
          </div>
          {/* Chat skeleton */}
          <div className="flex-1 bg-surface-light dark:bg-surface-dark rounded-2xl p-4 animate-pulse space-y-4">
            <div className="h-5 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="flex-1 flex items-center justify-center">
              <div className="w-64 space-y-3">
                <div className="h-8 w-full bg-gray-200 dark:bg-gray-700 rounded-xl mx-auto" />
                <div className="h-4 w-3/4 bg-gray-200 dark:bg-gray-700 rounded mx-auto" />
                <div className="h-4 w-1/2 bg-gray-200 dark:bg-gray-700 rounded mx-auto" />
              </div>
            </div>
            <div className="h-14 w-full bg-gray-200 dark:bg-gray-700 rounded-3xl" />
          </div>
          {/* Studio skeleton */}
          <div className="w-[320px] shrink-0 bg-surface-light dark:bg-surface-dark rounded-2xl p-4 animate-pulse space-y-3">
            <div className="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div className="h-32 w-full bg-gray-200 dark:bg-gray-700 rounded-2xl" />
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-14 bg-gray-200 dark:bg-gray-700 rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
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
              <span className="text-lg font-medium text-gray-700 dark:text-gray-200 truncate max-w-[150px] sm:max-w-none">
                {n.title}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Analytics dropdown */}
          <div ref={analyticsRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => {
                setAnalyticsOpen((v) => !v);
                setSettingsOpen(false);
                setProfileOpen(false);
              }}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              title="Analytics"
            >
              <span className="material-symbols-outlined">trending_up</span>
            </button>
            {analyticsOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-[#1e1f20] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-50">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Notebook Analytics</h3>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Sources</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{sources.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Ready</span>
                    <span className="text-xs font-medium text-emerald-600">{sources.filter(s => s.status === "ready").length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Processing</span>
                    <span className="text-xs font-medium text-amber-600">{sources.filter(s => ["pending","parsing","embedding"].includes(s.status)).length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Failed</span>
                    <span className="text-xs font-medium text-red-600">{sources.filter(s => s.status === "error").length}</span>
                  </div>
                  <div className="border-t border-gray-100 dark:border-gray-700 pt-2 mt-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Created</span>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{new Date(n.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => showToast("Share coming soon")}
            className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors border border-transparent hover:border-gray-300 dark:hover:border-gray-600"
            title="Share"
          >
            <span className="material-symbols-outlined text-lg">share</span>
            <span className="text-sm">Share</span>
          </button>

          {/* Settings dropdown */}
          <div ref={settingsRef} className="relative hidden sm:block">
            <button
              type="button"
              onClick={() => {
                setSettingsOpen((v) => !v);
                setAnalyticsOpen(false);
                setProfileOpen(false);
                if (!settingsOpen) setEditTitle(n.title === "Untitled notebook" ? "" : n.title);
              }}
              className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
              title="Settings"
            >
              <span className="material-symbols-outlined">settings</span>
            </button>
            {settingsOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-[#1e1f20] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4 z-50">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Settings</h3>

                {/* Rename */}
                <div className="mb-3">
                  <label className="text-xs text-gray-500 mb-1 block">Notebook title</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
                      className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-element-dark text-gray-800 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/40"
                      placeholder={n.title}
                    />
                    <button
                      onClick={handleRename}
                      disabled={!editTitle.trim() || updateNotebook.isPending}
                      className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      {updateNotebook.isPending ? "..." : "Save"}
                    </button>
                  </div>
                </div>

                {/* Divider + Delete */}
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                  <button
                    onClick={handleDeleteNotebook}
                    disabled={deleteNotebook.isPending}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                    {deleteNotebook.isPending ? "Deleting..." : "Delete notebook"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Profile dropdown */}
          <div ref={profileRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setProfileOpen((v) => !v);
                setAnalyticsOpen(false);
                setSettingsOpen(false);
              }}
              className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm ml-2 cursor-pointer hover:ring-2 hover:ring-indigo-400 transition-shadow"
            >
              {(session.user.name ?? session.user.email)
                .slice(0, 2)
                .toUpperCase()}
            </button>
            {profileOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white dark:bg-[#1e1f20] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-50">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{session.user.name}</p>
                  <p className="text-xs text-gray-500">{session.user.email}</p>
                </div>
                <div className="p-2">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Theme</span>
                    <ThemeToggle />
                  </div>
                  <button
                    onClick={() => signOut().then(() => router.push("/"))}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Desktop layout: 3-panel with resize handles */}
      <main className="flex-1 hidden md:flex px-3 pb-3 overflow-hidden">
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

      {/* Mobile layout: tab-based single panel */}
      <main className="flex-1 flex flex-col md:hidden overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {mobileTab === "sources" && (
            <div className="h-full bg-surface-light dark:bg-surface-dark flex flex-col overflow-hidden">
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
            </div>
          )}
          {mobileTab === "chat" && (
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
          )}
          {mobileTab === "studio" && (
            <div className="h-full bg-surface-light dark:bg-surface-dark flex flex-col overflow-hidden">
              <StudioPanel
                notebookId={id}
                onMindmapNodeClick={handleMindmapNodeClick}
              />
            </div>
          )}
        </div>

        {/* Bottom tab bar */}
        <div className="shrink-0 flex border-t border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
          {(
            [
              { id: "sources" as const, icon: "description", label: "Sources" },
              { id: "chat" as const, icon: "chat", label: "Chat" },
              { id: "studio" as const, icon: "auto_awesome", label: "Studio" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
                mobileTab === tab.id
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <span className="material-symbols-outlined text-xl">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </main>

      {/* Add Note floating button + modal */}
      <div className="fixed bottom-6 left-0 right-0 hidden md:flex justify-center pointer-events-none z-40">
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
