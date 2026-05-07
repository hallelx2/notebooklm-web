"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

export const textareaVariants = cva(
  [
    "w-full bg-surface text-fg placeholder:text-fg-muted",
    "border border-border-subtle rounded-input",
    "px-4 py-3 text-sm transition-colors",
    "focus:outline-none focus:border-fg-accent",
    "disabled:opacity-60 disabled:cursor-not-allowed",
    "resize-y",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "min-h-[80px]",
        md: "min-h-[120px]",
        lg: "min-h-[200px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type TextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "size"
> &
  VariantProps<typeof textareaVariants>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ className, size, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        className={cn(textareaVariants({ size }), className)}
        {...rest}
      />
    );
  },
);
