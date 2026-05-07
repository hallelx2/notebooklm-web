"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

/**
 * IconButton — square icon-only button. Wraps a Material Symbols icon
 * (passed as `icon` prop) so consumers don't have to remember the
 * .material-symbols-outlined class + size cadence. For non-MS icons,
 * pass children directly instead of `icon`.
 */
export const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center shrink-0",
    "transition-colors rounded-pill",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fg-accent focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      variant: {
        ghost: "bg-transparent text-fg-muted hover:bg-accent-soft hover:text-fg",
        soft: "bg-accent-soft text-fg-accent hover:bg-fg-accent hover:text-fg-on-accent",
        outline:
          "border border-border-subtle bg-transparent text-fg hover:border-border-strong",
      },
      size: {
        xs: "h-6 w-6 [&_.material-symbols-outlined]:text-[14px]",
        sm: "h-8 w-8 [&_.material-symbols-outlined]:text-[18px]",
        md: "h-9 w-9 [&_.material-symbols-outlined]:text-[20px]",
        lg: "h-11 w-11 [&_.material-symbols-outlined]:text-[24px]",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof iconButtonVariants> & {
    /** Material Symbol identifier, e.g. "settings", "more_vert". */
    icon?: string;
    /** Set true to render the icon with FILL=1 (Material Symbols variation). */
    filled?: boolean;
    /** Required for a11y when using icon-only — the screen-reader label. */
    "aria-label": string;
  };

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      className,
      variant,
      size,
      type = "button",
      icon,
      filled,
      children,
      ...rest
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn(iconButtonVariants({ variant, size }), className)}
        {...rest}
      >
        {icon ? (
          <span
            className={cn(
              "material-symbols-outlined",
              filled && "icon-filled",
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : (
          children
        )}
      </button>
    );
  },
);
