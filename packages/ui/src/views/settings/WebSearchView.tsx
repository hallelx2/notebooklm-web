"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { inferRouterOutputs } from "@trpc/server";
import { useEffect, useState } from "react";
import type { AppRouter } from "@notebooklm/server";
import { trpc } from "@notebooklm/ui/trpc/client";
import { SettingsSection } from "./SettingsSection";

/**
 * Settings → Web Search.
 *
 * Renders one row per provider. Each row carries:
 *   - drag handle (⠿) for reordering the fallback chain
 *   - enable/disable toggle (independent of credential state)
 *   - configured-state badge (saved key, env fallback, or unset)
 *   - inline editor with the dynamic field set the descriptor declared
 *   - Test + Save buttons, with latency + sample title on success
 *
 * Adding a new provider in `packages/core/src/search/` is zero UI
 * change — the component iterates the descriptor's `fields` array and
 * renders the right input per `key` + `type`.
 */

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ListResponse = RouterOutputs["searchConfig"]["list"];
type ProviderRow = ListResponse["providers"][number];

export function WebSearchView() {
  const listQ = trpc.searchConfig.list.useQuery();
  const utils = trpc.useUtils();

  const [order, setOrder] = useState<string[]>([]);
  // Sync local DnD state when the server payload arrives or refetches.
  useEffect(() => {
    if (listQ.data?.order) setOrder(listQ.data.order);
  }, [listQ.data?.order]);

  const setOrderMut = trpc.searchConfig.setOrder.useMutation({
    onSuccess: () => utils.searchConfig.list.invalidate(),
  });
  const setEnabledMut = trpc.searchConfig.setEnabled.useMutation({
    onSuccess: () => utils.searchConfig.list.invalidate(),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = order.indexOf(active.id as string);
    const newIndex = order.indexOf(over.id as string);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(order, oldIndex, newIndex);
    setOrder(next); // optimistic
    setOrderMut.mutate({
      order: next as ("exa" | "tavily" | "searxng")[],
    });
  };

  const providers = listQ.data?.providers ?? [];
  // Render in the user's saved order; unknown ids fall to the end.
  const sorted = [...providers].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });

  const enabledAndConfigured = sorted.filter(
    (p) =>
      p.enabled &&
      ((p.configured?.hasKey ?? false) ||
        p.envFallback.apiKey ||
        !!p.configured?.baseUrl ||
        p.envFallback.baseUrl),
  );

  return (
    <SettingsSection
      tagline="Settings · Web Search"
      title="Web Search"
      description="Pick which providers run when deep-research needs the web. Drag to reorder. Each provider's API key (or instance URL) is encrypted at rest with this install's key — same pattern as the AI providers tab."
    >
      {listQ.isLoading ? (
        <Loading />
      ) : (
        <>
          {enabledAndConfigured.length === 0 ? (
            <ZeroProvidersBanner />
          ) : null}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-3">
                {sorted.map((p) => (
                  <SortableProviderRow
                    key={p.id}
                    row={p}
                    onToggleEnabled={(next) =>
                      setEnabledMut.mutate({ provider: p.id, enabled: next })
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </SettingsSection>
  );
}

/* ------------------------------------------------------------------ */
/*  Single sortable row + inline editor                                 */
/* ------------------------------------------------------------------ */

function SortableProviderRow({
  row,
  onToggleEnabled,
}: {
  row: ProviderRow;
  onToggleEnabled: (next: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });

  const [open, setOpen] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0a0a0a]"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Drag ${row.descriptor.label} to reorder`}
          className="cursor-grab active:cursor-grabbing text-slate-400 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300"
        >
          <span className="material-symbols-outlined text-[18px]">
            drag_indicator
          </span>
        </button>

        <Toggle checked={row.enabled} onChange={onToggleEnabled} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-slate-900 dark:text-white">
              {row.descriptor.label}
            </span>
            <ConfiguredBadge row={row} />
          </div>
          <p className="text-xs text-slate-500 dark:text-zinc-400 truncate">
            {row.descriptor.description}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white px-3 py-1.5 border border-slate-300 dark:border-white/20 hover:border-slate-900 dark:hover:border-white transition-colors"
        >
          {open ? "Close" : row.configured ? "Edit" : "Configure"}
        </button>
      </div>

      {open ? <ProviderEditor row={row} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function ConfiguredBadge({ row }: { row: ProviderRow }) {
  if (row.configured?.hasKey || row.configured?.baseUrl) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
        <span className="material-symbols-outlined text-[11px]">
          check_circle
        </span>
        Saved
      </span>
    );
  }
  if (row.envFallback.apiKey || row.envFallback.baseUrl) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-400">
        <span className="material-symbols-outlined text-[11px]">terminal</span>
        Env
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">
      <span className="material-symbols-outlined text-[11px]">close</span>
      Not configured
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Inline editor — credentials form + Test + Save                      */
/* ------------------------------------------------------------------ */

function ProviderEditor({
  row,
  onClose,
}: {
  row: ProviderRow;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState<{ apiKey: string; baseUrl: string }>({
    apiKey: "",
    baseUrl: row.configured?.baseUrl ?? "",
  });
  const [testResult, setTestResult] = useState<
    | { ok: true; latencyMs: number; sample: { url: string; title: string } }
    | { ok: false; error: string }
    | null
  >(null);

  const upsertMut = trpc.searchConfig.upsertCredential.useMutation({
    onSuccess: () => {
      utils.searchConfig.list.invalidate();
      onClose();
    },
  });
  const deleteMut = trpc.searchConfig.deleteCredential.useMutation({
    onSuccess: () => {
      utils.searchConfig.list.invalidate();
      onClose();
    },
  });
  const testMut = trpc.searchConfig.testConnection.useMutation({
    onSuccess: (data) => setTestResult(data),
  });

  return (
    <div className="border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#070707] px-4 py-4 space-y-3">
      {row.descriptor.fields.map((f) => (
        <label key={f.key} className="block">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-zinc-300 mb-1">
            {f.label}
            {f.required ? (
              <span className="text-red-600 dark:text-red-400 ml-1">*</span>
            ) : null}
          </div>
          <input
            type={f.type ?? "text"}
            placeholder={
              f.key === "apiKey" && row.configured?.hasKey
                ? row.configured.maskedKey
                : f.placeholder
            }
            value={f.key === "apiKey" ? draft.apiKey : draft.baseUrl}
            onChange={(e) =>
              setDraft((d) => ({ ...d, [f.key]: e.target.value }))
            }
            className="w-full bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600 focus:border-slate-900 dark:focus:border-white focus:outline-none"
          />
          {f.hint ? (
            <p className="text-[11px] text-slate-500 dark:text-zinc-500 mt-1">
              {f.hint}
            </p>
          ) : null}
        </label>
      ))}

      {testResult ? (
        <div
          className={`text-xs p-3 border ${
            testResult.ok
              ? "border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200"
              : "border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/30 text-red-900 dark:text-red-200"
          }`}
        >
          {testResult.ok ? (
            <>
              <div className="font-medium mb-1">
                ✓ {testResult.latencyMs}ms — sample result:
              </div>
              <div className="font-mono text-[11px] truncate">
                {testResult.sample.title}
              </div>
            </>
          ) : (
            <>
              <div className="font-medium mb-1">✗ Test failed</div>
              <div className="font-mono text-[11px]">{testResult.error}</div>
            </>
          )}
        </div>
      ) : null}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() =>
            testMut.mutate({
              provider: row.id,
              apiKey: draft.apiKey || undefined,
              baseUrl: draft.baseUrl || undefined,
            })
          }
          disabled={testMut.isPending}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 border border-slate-300 dark:border-white/20 hover:border-slate-900 dark:hover:border-white text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-50"
        >
          {testMut.isPending ? "Testing…" : "Test connection"}
        </button>
        <button
          type="button"
          onClick={() =>
            upsertMut.mutate({
              provider: row.id,
              apiKey: draft.apiKey || undefined,
              baseUrl: draft.baseUrl || undefined,
            })
          }
          disabled={upsertMut.isPending}
          className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-black hover:bg-slate-800 dark:hover:bg-zinc-200 transition-colors disabled:opacity-50"
        >
          {upsertMut.isPending ? "Saving…" : "Save"}
        </button>
        {row.configured ? (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Remove the saved credential for ${row.descriptor.label}?`)) {
                deleteMut.mutate({ provider: row.id });
              }
            }}
            disabled={deleteMut.isPending}
            className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 text-red-700 dark:text-red-400 hover:underline ml-auto disabled:opacity-50"
          >
            Remove
          </button>
        ) : null}
      </div>

      <p className="text-[11px] text-slate-500 dark:text-zinc-500">
        Need help?{" "}
        <a
          href={row.descriptor.homepage}
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-slate-900 dark:hover:text-white"
        >
          {row.descriptor.homepage}
        </a>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Bits and pieces                                                     */
/* ------------------------------------------------------------------ */

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        checked
          ? "bg-emerald-500"
          : "bg-slate-300 dark:bg-zinc-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function ZeroProvidersBanner() {
  return (
    <div className="mb-6 p-4 border border-amber-300 dark:border-amber-800/60 bg-amber-50 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
      <div className="flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] mt-0.5">
          warning
        </span>
        <div className="text-sm">
          <div className="font-medium mb-1">
            No web search providers active
          </div>
          <p className="text-xs leading-relaxed">
            Deep-research needs at least one provider to fetch sources from
            the web. Toggle one on below and add a key (or self-host SearxNG
            and point at it).
          </p>
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return (
    <div className="py-20 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-500">
      Loading…
    </div>
  );
}
