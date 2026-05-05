"use client";

import { useEffect, useState } from "react";
import { useRouter } from "../../contexts";
import { trpc } from "../../trpc/client";

/**
 * Wizard step #6 — Done.
 *
 * The chat-provider step writes `chatProvider` and the embedding
 * step writes `embeddingProvider`/`embeddingModel`/`embeddingDim`.
 * The aiConfig.update mutation flips `onboardedAt` automatically as
 * soon as both halves are set (see aiConfig.ts:147-165). So here we
 * just verify and bounce.
 *
 * If the user got to this step without a chat OR an embedding
 * configured, we route them BACK to the relevant step instead of
 * forward — that's better than letting them through to /notebooks
 * just to bounce off AuthGate.
 */

export function DoneStep({
  onJumpTo,
}: {
  onJumpTo: (id: "welcome" | "chat" | "embedding" | "audio" | "search") => void;
}) {
  const router = useRouter();
  const aiConfigQ = trpc.aiConfig.get.useQuery();
  const [redirected, setRedirected] = useState(false);

  const cfg = aiConfigQ.data;
  const missingChat = !cfg?.chatProvider;
  const missingEmbed = !cfg?.embeddingProvider;
  const ok = !!cfg && !missingChat && !missingEmbed;

  // Auto-redirect to /notebooks once everything's in place. We give it
  // a beat so the user sees the success screen rather than a snap-cut.
  useEffect(() => {
    if (!ok || redirected) return;
    const t = setTimeout(() => {
      setRedirected(true);
      router.replace("/notebooks");
    }, 1500);
    return () => clearTimeout(t);
  }, [ok, redirected, router]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-3">
          {ok ? "All set" : "Almost there"}
        </p>
        <h1 className="text-3xl sm:text-4xl font-medium tracking-tighter mb-2">
          {ok ? "You're ready to go." : "A couple of things still missing."}
        </h1>
      </div>

      {ok ? (
        <>
          <div className="rounded-xl border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/5 p-5 space-y-2 text-sm">
            <ConfigRow label="Chat" value={`${cfg.chatProvider} · ${cfg.chatModel ?? "default"}`} />
            <ConfigRow
              label="Embeddings"
              value={`${cfg.embeddingProvider} · ${cfg.embeddingModel ?? "default"} (${cfg.embeddingDim}d)`}
            />
          </div>
          <p className="text-[12px] text-slate-500 dark:text-zinc-400">
            Redirecting to your notebooks in a second...
          </p>
          <button
            type="button"
            onClick={() => router.replace("/notebooks")}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black font-medium text-sm hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors"
          >
            Open my notebooks now
            <span className="material-symbols-outlined text-base">
              arrow_forward
            </span>
          </button>
        </>
      ) : (
        <div className="space-y-3">
          {missingChat && (
            <MissingItem
              title="No chat AI provider"
              body="Pick a provider in step 2 — without one the app can't answer questions."
              onFix={() => onJumpTo("chat")}
            />
          )}
          {missingEmbed && (
            <MissingItem
              title="No embedding model"
              body="Pick a model in step 3 — needed to find relevant chunks of your sources."
              onFix={() => onJumpTo("embedding")}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300 w-24 shrink-0">
        {label}
      </span>
      <span className="text-sm text-slate-900 dark:text-white font-mono break-all">
        {value}
      </span>
    </div>
  );
}

function MissingItem({
  title,
  body,
  onFix,
}: {
  title: string;
  body: string;
  onFix: () => void;
}) {
  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5 p-4 flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-medium text-amber-900 dark:text-amber-200">
          {title}
        </h3>
        <p className="text-[12px] text-amber-800 dark:text-amber-300/80 mt-1 leading-relaxed">
          {body}
        </p>
      </div>
      <button
        type="button"
        onClick={onFix}
        className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 border border-amber-400 dark:border-amber-500/40 hover:border-amber-700 dark:hover:border-amber-300 text-amber-900 dark:text-amber-200 transition-colors rounded"
      >
        Fix it
      </button>
    </div>
  );
}
