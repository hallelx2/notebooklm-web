"use client";

import { type HTMLAttributes, type ReactNode, useEffect } from "react";
import { cn } from "../../utils/cn";
import { IconButton } from "./IconButton";

/**
 * Modal — token-driven dialog shell. Renders a fixed overlay with the
 * card surface centered. Caller controls open/close via `open`. The
 * scroll-lock + Escape-to-close are handled here so consumers don't
 * have to remember.
 *
 * Lighter than a full headless-ui Dialog — no portaling here, the
 * overlay sits at z-50 in the normal DOM tree. Most modal usages in
 * this codebase don't need portaling because they don't render inside
 * scrolling parents.
 */

export type ModalProps = HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  /** Pass false to hide the default close button (e.g. forced flows). */
  showClose?: boolean;
  /** Pass false to keep the click-outside-to-close behaviour off. */
  dismissOnOverlay?: boolean;
};

const SIZE_MAX_WIDTH: Record<NonNullable<ModalProps["size"]>, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[95vw]",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  showClose = true,
  dismissOnOverlay = true,
  className,
  children,
  ...rest
}: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={dismissOnOverlay ? onClose : undefined}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-overlay backdrop-blur-sm"
      />
      <div
        className={cn(
          "relative w-full bg-elevated text-fg",
          "border border-border-subtle rounded-modal",
          "max-h-[90vh] overflow-hidden flex flex-col",
          SIZE_MAX_WIDTH[size],
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        {...rest}
      >
        {(title || showClose) && (
          <header className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border-subtle">
            <div className="min-w-0 flex-1">
              {title ? (
                <h2 className="text-lg font-medium tracking-tight text-fg">
                  {title}
                </h2>
              ) : null}
              {description ? (
                <p className="text-sm text-fg-secondary font-light leading-relaxed mt-1">
                  {description}
                </p>
              ) : null}
            </div>
            {showClose ? (
              <IconButton
                variant="ghost"
                size="sm"
                icon="close"
                aria-label="Close"
                onClick={onClose}
              />
            ) : null}
          </header>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}
