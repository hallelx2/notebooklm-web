"use client";

import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

/**
 * Skeleton — animated shimmer placeholder. Reuses the `shimmer`
 * keyframe defined in globals.css/main.css. Token-driven so it adapts
 * to whichever pack is active.
 */
export const Skeleton = forwardRef<HTMLSpanElement, HTMLAttributes<HTMLSpanElement>>(
  function Skeleton({ className, ...rest }, ref) {
    return (
      <span
        ref={ref}
        aria-hidden="true"
        className={cn(
          "relative block overflow-hidden bg-accent-soft",
          "before:content-[''] before:absolute before:inset-0",
          "before:-translate-x-full before:bg-gradient-to-r",
          "before:from-transparent before:via-fg-muted/20 before:to-transparent",
          "before:animate-[shimmer_1.6s_infinite]",
          className,
        )}
        {...rest}
      />
    );
  },
);
