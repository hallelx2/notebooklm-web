"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { trpc } from "@/trpc/client";
import { ChatPanel } from "../components/ChatPanel";
import { DeepResearchModal } from "../components/DeepResearchModal";
import { ResizeHandle } from "../components/ResizeHandle";
import { SourcesPanel } from "../components/SourcesPanel";
import { StudioModal } from "../components/StudioModal";
import { showToast, Toast } from "../components/Toast";
import { UploadModal } from "../components/UploadModal";

const STUDIO_TOOLS: { icon: string; label: string }[] = [
  { icon: "graphic_eq", label: "Audio Overview" },
  { icon: "video_library", label: "Video Overview" },
  { icon: "account_tree", label: "Mind Map" },
  { icon: "summarize", label: "Reports" },
  { icon: "style", label: "Flashcards" },
  { icon: "quiz", label: "Quiz" },
  { icon: "insert_chart", label: "Infographic" },
  { icon: "slideshow", label: "Slide deck" },
  { icon: "table_chart", label: "Data table" },
];

export function NotebookView({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (searchParams.get("onboard") === "1") {
      setUploadOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("onboard");
      window.history.replaceState({}, "", url.toString());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  const [studioModal, setStudioModal] = useState<
    { icon: string; label: string } | null
  >(null);
  const [deepOpen, setDeepOpen] = useState(false);
  const [deepQuery, setDeepQuery] = useState<string | undefined>(undefined);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  if (isPending || q.isPending) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-500">
        Loading notebook...
      </main>
    );
  }

  if (!session?.user) {
    router.replace("/auth/sign-in");
    return null;
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
            <span className="text-lg font-medium text-gray-700 dark:text-gray-200">
              {n.title}
            </span>
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
          onOpenUpload={() => setUploadOpen(true)}
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
          <div className="p-4 flex items-center justify-between">
            <h2 className="font-medium text-gray-800 dark:text-gray-200">
              Studio
            </h2>
            <button
              type="button"
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
            >
              <span className="material-symbols-outlined">
                right_panel_close
              </span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="grid grid-cols-2 gap-2">
              {STUDIO_TOOLS.map((t) => (
                <button
                  type="button"
                  key={t.label}
                  onClick={() => setStudioModal(t)}
                  className="p-3 rounded-xl bg-element-light dark:bg-element-dark hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer group flex flex-col gap-2 text-left"
                >
                  <span className="material-symbols-outlined text-gray-500 dark:text-gray-400 group-hover:text-blue-500">
                    {t.icon}
                  </span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-10 text-center">
              <span className="material-symbols-outlined text-gray-400 mb-2">
                auto_fix_high
              </span>
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Studio output will be saved here.
              </p>
              <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                After adding sources, click to add Audio Overview, study guide,
                mind map and more!
              </p>
            </div>
          </div>
        </aside>
      </main>

      <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none z-40">
        <button
          type="button"
          onClick={() => showToast("Note added")}
          className="pointer-events-auto shadow-lg flex items-center gap-2 px-5 py-3 bg-gray-900 dark:bg-white text-white dark:text-black rounded-full font-medium hover:scale-105 transition-transform"
        >
          <span className="material-symbols-outlined text-lg">edit_note</span>
          Add note
        </button>
      </div>

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
      <StudioModal
        open={!!studioModal}
        title={studioModal?.label ?? ""}
        icon={studioModal?.icon ?? "auto_fix_high"}
        onClose={() => setStudioModal(null)}
      />
      <Toast />
    </div>
  );
}
