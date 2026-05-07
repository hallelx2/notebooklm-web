"use client";

import { type HTMLAttributes } from "react";
import { cn } from "../../utils/cn";

/**
 * Spinner — token-driven loading indicator. Uses
 * material-symbols-outlined "progress_activity" with Tailwind's
 * animate-spin. Inherits color from text-* in cn.
 */
export function Spinner({
  className,
  size = 16,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & { size?: number }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        "material-symbols-outlined animate-spin inline-block",
        className,
      )}
      style={{ fontSize: size }}
      {...rest}
    >
      progress_activity
    </span>
  );
}
