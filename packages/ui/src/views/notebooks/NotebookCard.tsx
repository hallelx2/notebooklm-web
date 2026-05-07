"use client";

import { cardVariants } from "@notebooklm/ui/components/primitives";
import { IconButton, Pill, Text, cn } from "@notebooklm/ui";
import { Link } from "@notebooklm/ui/contexts";
import { useEffect, useRef, useState } from "react";

type Props = {
  id: string;
  title: string;
  description: string | null;
  createdAt: Date | string;
  sourceCount?: number;
  onDelete?: (id: string) => void;
};

const STEP_LABELS = ["SOURCES", "EMBED", "CHAT", "STUDIO"];

function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diff <= 0) return "TODAY";
  if (diff === 1) return "YESTERDAY";
  if (diff < 7) return `${diff}D AGO`;
  if (diff < 30) return `${Math.floor(diff / 7)}W AGO`;
  return date
    .toLocaleDateString(undefined, { month: "short", day: "2-digit" })
    .toUpperCase();
}

export function NotebookCard({
  id,
  title,
  description,
  createdAt,
  sourceCount = 0,
  onDelete,
}: Props) {
  const activeStep = sourceCount > 0 ? 2 : 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <Link
      href={`/notebooks/${id}`}
      className={cn(
        cardVariants({ variant: "default", padding: "lg", interactive: true }),
        "group flex flex-col gap-4 sm:gap-5",
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-transparent to-accent-soft opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

      <div className="flex justify-between items-start relative z-10 gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold text-fg group-hover:text-fg-accent transition-colors line-clamp-2">
            {title}
          </h3>
          <div className="flex items-center gap-2 mt-2">
            <Text variant="meta" tone="muted" as="span">
              {formatDate(createdAt)}
            </Text>
            <span className="w-1 h-1 bg-fg-muted rounded-full" />
            <Text variant="meta" tone="muted" as="span">
              {sourceCount} source{sourceCount === 1 ? "" : "s"}
            </Text>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Pill tone="success">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
            Active
          </Pill>

          {onDelete && (
            <div ref={menuRef} className="relative">
              <IconButton
                variant="ghost"
                size="sm"
                icon="more_vert"
                aria-label="More options"
                title="More options"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setMenuOpen((prev) => !prev);
                }}
                className="opacity-0 group-hover:opacity-100"
              />

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-elevated border border-border-subtle rounded-card shadow-xl z-50 overflow-hidden">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen(false);
                      onDelete(id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      delete
                    </span>
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Text
        variant="body"
        tone="muted"
        className="text-xs leading-relaxed relative z-10 line-clamp-2 min-h-[2.4em]"
      >
        {description ?? "No description yet."}
      </Text>

      <div className="flex items-center gap-1 relative z-10 py-2 overflow-x-auto no-scrollbar">
        {STEP_LABELS.map((step, i) => {
          const reached = i <= activeStep;
          return (
            <div key={step} className="flex items-center gap-1">
              {i > 0 && (
                <div
                  className={cn(
                    "w-3 h-[1px] transition-colors",
                    reached
                      ? "bg-fg-accent/60 group-hover:bg-fg-accent"
                      : "bg-border-subtle",
                  )}
                />
              )}
              <Pill
                tone={reached ? "accent" : "neutral"}
                size="sm"
                className={cn(
                  reached
                    ? "group-hover:border-border-accent"
                    : "group-hover:border-border-strong",
                )}
              >
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-colors",
                    reached ? "bg-fg-accent" : "bg-fg-muted/50",
                  )}
                />
                {step}
              </Pill>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 mt-auto relative z-10">
        <Pill tone="neutral" className="group-hover:border-border-accent group-hover:text-fg-accent">
          Private
        </Pill>
        <Pill tone="neutral" className="group-hover:border-border-accent group-hover:text-fg-accent">
          Gemini 2.5
        </Pill>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-fg-muted group-hover:text-fg-accent transition-colors flex items-center gap-1">
          Open
          <span className="material-symbols-outlined text-[12px]">
            arrow_forward
          </span>
        </span>
      </div>
    </Link>
  );
}
