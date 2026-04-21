"use client";

import { useRef, useState } from "react";
import { trpc } from "@/trpc/client";
import { showToast } from "./Toast";

type Tab = "files" | "link" | "drive";

type Props = {
  open: boolean;
  onClose: () => void;
  notebookId: string;
};

type PendingFile = {
  file: File;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export function UploadModal({ open, onClose, notebookId }: Props) {
  const [tab, setTab] = useState<Tab>("files");
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [link, setLink] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utils = trpc.useUtils();

  const addLink = trpc.source.addLink.useMutation({
    onSuccess: () => {
      utils.source.list.invalidate({ notebookId });
      showToast("Link added — parsing");
      setLink("");
    },
    onError: (e) => showToast(e.message),
  });

  if (!open) return null;

  async function uploadOne(p: PendingFile, idx: number) {
    setPending((prev) =>
      prev.map((x, i) => (i === idx ? { ...x, status: "uploading" } : x)),
    );
    const fd = new FormData();
    fd.append("notebookId", notebookId);
    fd.append("file", p.file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      setPending((prev) =>
        prev.map((x, i) => (i === idx ? { ...x, status: "done" } : x)),
      );
      utils.source.list.invalidate({ notebookId });
    } catch (err) {
      setPending((prev) =>
        prev.map((x, i) =>
          i === idx
            ? {
                ...x,
                status: "error",
                error: err instanceof Error ? err.message : String(err),
              }
            : x,
        ),
      );
    }
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const added: PendingFile[] = files.map((f) => ({
      file: f,
      status: "queued",
    }));
    setPending((prev) => {
      const next = [...prev, ...added];
      added.forEach((_, i) => uploadOne(added[i], prev.length + i));
      return next;
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files ?? []);
    if (!files.length) return;
    const added: PendingFile[] = files.map((f) => ({
      file: f,
      status: "queued",
    }));
    setPending((prev) => {
      const next = [...prev, ...added];
      added.forEach((_, i) => uploadOne(added[i], prev.length + i));
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-2xl bg-surface-light dark:bg-surface-dark rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-border-dark shrink-0">
          <h2 className="text-xl font-medium text-gray-800 dark:text-gray-200">
            Add & Manage Sources
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="flex px-6 pt-2 border-b border-gray-100 dark:border-border-dark shrink-0 gap-8">
          {(
            [
              { id: "files", icon: "upload_file", label: "Upload Files" },
              { id: "link", icon: "link", label: "Link" },
              { id: "drive", icon: "add_to_drive", label: "Google Drive" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`pb-3 border-b-2 font-medium text-sm flex items-center gap-2 transition-colors ${
                tab === t.id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                {t.icon}
              </span>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "files" && (
          <div className="overflow-y-auto p-6 flex-1">
            {pending.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">
                  Uploading & Embedding
                </h3>
                <div className="space-y-2">
                  {pending.map((p, i) => (
                    <div
                      key={`${p.file.name}-${i}`}
                      className="flex items-center gap-3 p-3 rounded-xl bg-element-light dark:bg-element-dark"
                    >
                      <span className="material-symbols-outlined text-blue-500">
                        description
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {p.file.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {(p.file.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <span className="text-xs text-gray-500 capitalize">
                        {p.status === "error"
                          ? `error: ${p.error?.slice(0, 40)}`
                          : p.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-10 flex flex-col items-center justify-center text-center bg-gray-50 dark:bg-element-dark/50 hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:border-blue-300 transition-all cursor-pointer group"
              >
                <div className="w-14 h-14 rounded-full bg-white dark:bg-surface-dark shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <span className="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400">
                    cloud_upload
                  </span>
                </div>
                <p className="text-base font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Drag & drop or{" "}
                  <span className="text-blue-600 hover:underline">
                    choose files
                  </span>{" "}
                  to upload
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Supported formats: PDF, TXT, MD (Max 200MB)
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
                  onChange={onFiles}
                />
              </div>
            </div>
          </div>
        )}

        {tab === "link" && (
          <div className="p-6 flex-1">
            <label
              htmlFor="linkInput"
              className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block"
            >
              Enter URL
            </label>
            <input
              id="linkInput"
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-element-dark text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 mb-6"
              placeholder="https://example.com/article"
            />
            <button
              type="button"
              disabled={!link || addLink.isPending}
              onClick={() => addLink.mutate({ notebookId, url: link })}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
            >
              {addLink.isPending ? "Adding..." : "Add Link"}
            </button>
          </div>
        )}

        {tab === "drive" && (
          <div className="p-6 flex-1">
            <div className="text-center py-10">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-3xl text-green-600 dark:text-green-400">
                  add_to_drive
                </span>
              </div>
              <p className="text-base font-medium text-gray-700 dark:text-gray-200 mb-2">
                Connect Google Drive
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Import files directly from your Google Drive
              </p>
              <button
                type="button"
                onClick={() => showToast("Google Drive integration coming soon!")}
                className="mt-4 px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-full font-medium transition-colors"
              >
                Connect Drive
              </button>
            </div>
          </div>
        )}

        <div className="p-4 bg-gray-50 dark:bg-surface-dark border-t border-gray-100 dark:border-border-dark flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="material-symbols-outlined text-lg">
              check_circle
            </span>
            <span>
              {pending.filter((p) => p.status === "done").length} of{" "}
              {pending.length} uploaded
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 rounded-full transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
