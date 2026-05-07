"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

/**
 * Card primitive — token-driven surface. Variants describe role, not
 * visuals; saigon (10px corners, atmospheric) and render (0px corners,
 * crisp) interpret each role differently via tokens.
 *
 * Polymorphic by design — most usages wrap a router Link, so we expose
 * `cardVariants` (and `cardLinkVariants` below) so consumers can apply
 * the styles to their own root element.
 */
export const cardVariants = cva(
  [
    "relative overflow-hidden rounded-card",
    "transition-colors duration-300",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Standard surface card — bg-surface, subtle border. */
        default:
          "border border-border-subtle bg-surface text-fg",
        /** Slightly raised — for modals or important surfaces. */
        elevated:
          "border border-border-subtle bg-elevated text-fg shadow-sm",
        /** No chrome at all — content sits flat against the canvas. */
        subtle:
          "bg-transparent text-fg",
        /** Dashed border for empty / drop-zone states. */
        dashed:
          "border border-dashed border-border-subtle bg-transparent text-fg",
        /** Accent-tinted — used for highlighted cards, callouts. */
        accent:
          "border border-border-accent bg-accent-soft text-fg",
      },
      padding: {
        none: "",
        sm: "p-4",
        md: "p-5",
        lg: "p-6 sm:p-7",
        xl: "p-7 sm:p-8",
      },
      interactive: {
        true: "hover:border-border-strong cursor-pointer",
        false: "",
      },
    },
    defaultVariants: {
      variant: "default",
      padding: "md",
      interactive: false,
    },
  },
);

export type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant, padding, interactive, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        cardVariants({ variant, padding, interactive }),
        className,
      )}
      {...rest}
    />
  );
});
