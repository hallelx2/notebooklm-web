"use client";

import { type LinkProps, RouterProvider } from "@notebooklm/ui/contexts";
import NextLink from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useMemo } from "react";

const NextLinkAdapter = (props: LinkProps) => {
  const { href, replace, ...rest } = props;
  return <NextLink href={href} replace={replace} {...rest} />;
};

export function RouterBridge({ children }: { children: ReactNode }) {
  const next = useRouter();
  const pathname = usePathname() ?? "/";
  const router = useMemo(
    () => ({
      push: (href: string) => next.push(href),
      replace: (href: string) => next.replace(href),
      back: () => next.back(),
      pathname,
    }),
    [next, pathname],
  );
  return (
    <RouterProvider router={router} link={NextLinkAdapter}>
      {children}
    </RouterProvider>
  );
}
