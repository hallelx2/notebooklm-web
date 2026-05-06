import { type LinkProps, RouterProvider } from "@notebooklm/ui/contexts";
import {
  Link as TanLink,
  useRouter as useTanRouter,
  useRouterState,
} from "@tanstack/react-router";
import { type ReactNode, useMemo } from "react";

/**
 * Split an `href` string like `/notebooks/abc?onboard=1` into the path the
 * TanStack Router can match (`to`) and a structured `search` object.
 *
 * TanStack Router's `to` is a *path*, not a URL — it does not parse `?...`
 * out as a search query. Passing the whole string makes
 * `interpolatePath` mangle the `?` into the path and the query is lost.
 * The shared UI's `useRouter().push` / `Link` API takes plain href
 * strings (Next.js semantics), so the bridge has to do the split.
 */
function parseHref(href: string): {
  to: string;
  search?: Record<string, string>;
} {
  const idx = href.indexOf("?");
  if (idx === -1) return { to: href };
  const search = Object.fromEntries(
    new URLSearchParams(href.slice(idx + 1)).entries(),
  );
  return { to: href.slice(0, idx), search };
}

const TanLinkAdapter = (props: LinkProps) => {
  const { href, replace, ...rest } = props;
  // TanStack Router's <Link> accepts `to` instead of `href`. The shape of
  // `rest` is largely compatible but we drop `replace` if not needed.
  // Same query-splitting rule as `parseHref` above.
  const { to, search } = parseHref(href);
  return <TanLink to={to} search={search} replace={replace} {...rest} />;
};

export function RouterBridge({ children }: { children: ReactNode }) {
  const tan = useTanRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const router = useMemo(
    () => ({
      push: (href: string) => tan.navigate(parseHref(href)),
      replace: (href: string) =>
        tan.navigate({ ...parseHref(href), replace: true }),
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
