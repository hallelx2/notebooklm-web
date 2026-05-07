"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "../../utils/cn";

export const inputVariants = cva(
  [
    "w-full bg-surface text-fg placeholder:text-fg-muted",
    "border border-border-subtle rounded-input",
    "transition-colors",
    "focus:outline-none focus:border-fg-accent",
    "disabled:opacity-60 disabled:cursor-not-allowed",
  ].join(" "),
  {
    variants: {
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-11 px-4 text-sm",
        lg: "h-12 px-5 text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type InputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "size"
> &
  VariantProps<typeof inputVariants>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, size, type = "text", ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(inputVariants({ size }), className)}
      {...rest}
    />
  );
});
