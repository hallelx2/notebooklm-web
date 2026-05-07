"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

/**
 * Pill — small label / badge. saigon → fully round; render → 937px
 * (still pill-y but consistent with sharp aesthetic via tokens).
 */
export const pillVariants = cva(
  [
    "inline-flex items-center gap-1.5 px-2.5 py-1",
    "text-[10px] font-bold uppercase tracking-widest whitespace-nowrap",
    "rounded-pill border",
  ].join(" "),
  {
    variants: {
      tone: {
        neutral: "border-border-subtle bg-transparent text-fg-muted",
        accent: "border-border-accent bg-accent-soft text-fg-accent",
        success:
          "border-success/40 bg-success/10 text-success",
        warning:
          "border-warning/40 bg-warning/10 text-warning",
        danger:
          "border-danger/40 bg-danger/10 text-danger",
        info: "border-info/40 bg-info/10 text-info",
      },
      size: {
        sm: "h-5 px-2 text-[9px]",
        md: "h-6 px-2.5 text-[10px]",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export type PillProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof pillVariants>;

export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { className, tone, size, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={cn(pillVariants({ tone, size }), className)}
      {...rest}
    >
      {children}
    </span>
  );
});
