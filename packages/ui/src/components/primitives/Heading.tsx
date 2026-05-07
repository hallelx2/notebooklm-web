"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, createElement, forwardRef } from "react";
import { cn } from "../../utils/cn";

/**
 * Heading primitive — token-driven typographic scale. The `level` prop
 * picks the visual size (display / h1 / h2 / h3); the `as` prop picks
 * the semantic tag. They're independent so an h2-level callout can
 * still be an <h1> tag for SEO without locking the visual scale.
 */
export const headingVariants = cva("text-fg font-medium tracking-tight", {
  variants: {
    level: {
      display: "text-[length:var(--ds-text-display)] leading-[var(--ds-leading-display)] tracking-[var(--ds-tracking-display)]",
      h1: "text-[length:var(--ds-text-h1)] leading-[var(--ds-leading-h1)] tracking-[var(--ds-tracking-h1)]",
      h2: "text-[length:var(--ds-text-h2)] leading-[var(--ds-leading-h2)] tracking-[var(--ds-tracking-h2)]",
      h3: "text-[length:var(--ds-text-h3)] leading-[var(--ds-leading-h3)] tracking-[var(--ds-tracking-h3)]",
    },
    weight: {
      light: "font-light",
      regular: "font-normal",
      medium: "font-medium",
      semibold: "font-semibold",
      bold: "font-bold",
    },
  },
  defaultVariants: { level: "h1", weight: "medium" },
});

type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export type HeadingProps = HTMLAttributes<HTMLHeadingElement> &
  VariantProps<typeof headingVariants> & {
    as?: HeadingTag;
  };

export const Heading = forwardRef<HTMLHeadingElement, HeadingProps>(
  function Heading(
    { className, level, weight, as = "h1", children, ...rest },
    ref,
  ) {
    return createElement(
      as,
      {
        ref,
        className: cn(headingVariants({ level, weight }), className),
        ...rest,
      },
      children,
    );
  },
);
