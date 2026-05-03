import {
  type ComponentProps,
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
} from "react";

export type Router = {
  push(href: string): void;
  replace(href: string): void;
  back(): void;
  pathname: string;
};

const RouterContext = createContext<Router | null>(null);

export function useRouter(): Router {
  const r = useContext(RouterContext);
  if (!r) {
    throw new Error(
      "RouterProvider missing. Wrap your app with the platform's RouterBridge.",
    );
  }
  return r;
}

export type LinkProps = ComponentProps<"a"> & {
  href: string;
  replace?: boolean;
};

const LinkContext = createContext<ComponentType<LinkProps> | null>(null);

export function Link(props: LinkProps) {
  const Impl = useContext(LinkContext);
  if (!Impl) {
    throw new Error(
      "LinkProvider missing. Wrap your app with the platform's RouterBridge.",
    );
  }
  return <Impl {...props} />;
}

export function RouterProvider({
  router,
  link,
  children,
}: {
  router: Router;
  link: ComponentType<LinkProps>;
  children: ReactNode;
}) {
  return (
    <RouterContext.Provider value={router}>
      <LinkContext.Provider value={link}>{children}</LinkContext.Provider>
    </RouterContext.Provider>
  );
}
