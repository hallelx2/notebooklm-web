"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { type HTMLAttributes, createElement, forwardRef } from "react";
import { cn } from "../../utils/cn";

const gapMap = {
  none: "",
  "2xs": "gap-1",
  xs: "gap-2",
  sm: "gap-3",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
  "2xl": "gap-12",
} as const;

const stackVariants = cva("flex", {
  variants: {
    direction: { col: "flex-col", row: "flex-row" },
    align: {
      start: "items-start",
      center: "items-center",
      end: "items-end",
      stretch: "items-stretch",
    },
    justify: {
      start: "justify-start",
      center: "justify-center",
      between: "justify-between",
      end: "justify-end",
    },
    wrap: { yes: "flex-wrap", no: "flex-nowrap" },
  },
  defaultVariants: {
    direction: "col",
    align: "stretch",
    justify: "start",
    wrap: "no",
  },
});

type Gap = keyof typeof gapMap;

export type StackProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof stackVariants> & {
    as?: "div" | "section" | "header" | "main" | "nav" | "ul" | "ol" | "li";
    gap?: Gap;
  };

/** Stack — vertical-by-default flex container with token-driven gap. */
export const Stack = forwardRef<HTMLElement, StackProps>(function Stack(
  {
    className,
    direction,
    align,
    justify,
    wrap,
    gap = "md",
    as = "div",
    children,
    ...rest
  },
  ref,
) {
  return createElement(
    as,
    {
      ref,
      className: cn(
        stackVariants({ direction, align, justify, wrap }),
        gapMap[gap],
        className,
      ),
      ...rest,
    },
    children,
  );
});

/** Inline — horizontal-by-default convenience wrapper. */
export const Inline = forwardRef<HTMLElement, Omit<StackProps, "direction">>(
  function Inline({ align = "center", ...rest }, ref) {
    return <Stack ref={ref} direction="row" align={align} {...rest} />;
  },
);
