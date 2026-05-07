"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, createElement, forwardRef } from "react";
import { cn } from "../../utils/cn";

/**
 * Text primitive — body / caption / mono variants tied to the active
 * pack's type scale. Semantic tag follows from `as` (default <p>).
 */
export const textVariants = cva("", {
  variants: {
    variant: {
      body: "text-[length:var(--ds-text-body)] leading-[var(--ds-leading-body)] font-body",
      caption:
        "text-[length:var(--ds-text-caption)] leading-[var(--ds-leading-caption)] font-body uppercase tracking-widest font-bold",
      mono: "font-mono text-xs uppercase tracking-wider",
      lead: "text-base sm:text-lg leading-relaxed font-light",
      meta: "text-xs font-mono uppercase tracking-widest",
    },
    tone: {
      primary: "text-fg",
      secondary: "text-fg-secondary",
      muted: "text-fg-muted",
      accent: "text-fg-accent",
      danger: "text-danger",
      success: "text-success",
    },
  },
  defaultVariants: { variant: "body", tone: "primary" },
});

type TextTag = "p" | "span" | "div" | "label" | "small";

export type TextProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof textVariants> & {
    as?: TextTag;
  };

export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  { className, variant, tone, as = "p", children, ...rest },
  ref,
) {
  return createElement(
    as,
    {
      ref,
      className: cn(textVariants({ variant, tone }), className),
      ...rest,
    },
    children,
  );
});
