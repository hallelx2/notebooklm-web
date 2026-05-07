"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

/**
 * Button primitive — token-driven, pack-aware. Reads --ds-radius-button
 * via the `rounded-button` utility (saigon → 75px pill, render → 0px
 * sharp). Variants describe semantics, not visuals — the active pack
 * decides what each one looks like.
 */
export const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    "rounded-button",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Solid foreground-on-canvas — the strongest visual weight. */
        primary: "bg-fg text-fg-inverted hover:bg-fg-secondary",
        /** Brand accent — purple in render, sage in saigon. */
        accent:
          "bg-accent text-fg-on-accent hover:bg-accent-hover active:bg-accent-active",
        /** Outlined — secondary action, bounded by border-strong. */
        secondary:
          "border border-border-strong bg-transparent text-fg hover:bg-accent-soft",
        /** No chrome — for tertiary actions in dense spaces. */
        ghost: "bg-transparent text-fg hover:bg-accent-soft",
        /** Tinted accent panel — for subtle CTAs / filters. */
        soft:
          "border border-border-accent bg-accent-soft text-fg-accent hover:bg-fg-accent hover:text-fg-on-accent",
        /** Inline link styling — no chrome at all. */
        link: "h-auto bg-transparent p-0 text-fg-accent underline-offset-4 hover:underline",
        /** Destructive action. */
        danger:
          "bg-danger text-danger-fg hover:opacity-90",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ className, variant, size, type = "button", ...rest }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size }), className)}
        {...rest}
      />
    );
  },
);
