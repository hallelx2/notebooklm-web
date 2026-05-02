import { type LinkProps, RouterProvider } from "@notebooklm/ui/contexts";
import {
  Link as TanLink,
  useRouter as useTanRouter,
  useRouterState,
} from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

const TanLinkAdapter = (props: LinkProps) => {
  const { href, replace, ...rest } = props;
  // TanStack Router's <Link> accepts `to` instead of `href`. The shape of
  // `rest` is largely compatible but we drop `replace` if not needed.
  return <TanLink to={href} replace={replace} {...rest} />;
};

export function RouterBridge({ children }: { children: ReactNode }) {
  const tan = useTanRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useMemo(
    () => ({
      push: (href: string) => tan.navigate({ to: href }),
      replace: (href: string) => tan.navigate({ to: href, replace: true }),
      back: () => tan.history.back(),
      pathname,
    }),
    [tan, pathname],
  );
  return (
    <RouterProvider router={router} link={TanLinkAdapter}>
      {children}
    </RouterProvider>
  );
}
