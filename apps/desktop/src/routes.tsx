import { AuthGate } from "@notebooklm/ui/components/AuthGate";
import { ThemeProvider } from "@notebooklm/ui/components/ThemeProvider";
import { SignInView } from "@notebooklm/ui/views/auth/SignInView";
import { SignUpView } from "@notebooklm/ui/views/auth/SignUpView";
import { NotebookView } from "@notebooklm/ui/views/notebook/NotebookView";
import { NotebooksView } from "@notebooklm/ui/views/notebooks/NotebooksView";
import { AppearanceView } from "@notebooklm/ui/views/settings/AppearanceView";
import { ModelsView } from "@notebooklm/ui/views/settings/ModelsView";
import { ProfileView } from "@notebooklm/ui/views/settings/ProfileView";
import { ProvidersView } from "@notebooklm/ui/views/settings/ProvidersView";
import { SettingsChrome } from "@notebooklm/ui/views/settings/SettingsChrome";
import { SettingsNav } from "@notebooklm/ui/views/settings/SettingsNav";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { AuthBridge } from "./providers/AuthBridge";
import { RouterBridge } from "./providers/RouterBridge";
import { TransportBridge } from "./providers/TransportBridge";

const rootRoute = createRootRoute({
  // Bridges live INSIDE the TanStack Router so RouterBridge can read its
  // hooks. ThemeProvider sits at the top; the rest are wired in the same
  // order as apps/web's layout.
  component: () => (
    <ThemeProvider>
      <RouterBridge>
        <TransportBridge>
          <AuthBridge>
            <Outlet />
          </AuthBridge>
        </TransportBridge>
      </RouterBridge>
    </ThemeProvider>
  ),
});

// Desktop apps don't have a marketing landing page — the user double-clicks
// the icon to use the product, not to read about it. `/` bounces to
// `/notebooks`, which renders the notebook list when authenticated and
// redirects to `/auth/sign-in` otherwise (NotebooksView already does that
// guard via useAuth().status). Skipping the landing also means the LandingView
// component never gets bundled into the desktop renderer.
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/notebooks" });
  },
});

const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/sign-in",
  component: SignInView,
});

const signUpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth/sign-up",
  component: SignUpView,
});

// AuthGate enforces "must be signed in AND onboarded" before notebook
// surfaces. The settings tree below uses requireOnboarding={false} so the
// user can actually complete onboarding without being bounced out of it.
const notebooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notebooks",
  component: () => (
    <AuthGate>
      <NotebooksView />
    </AuthGate>
  ),
});

const notebookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notebooks/$id",
  component: () => {
    const { id } = notebookRoute.useParams();
    return (
      <AuthGate>
        <NotebookView id={id} />
      </AuthGate>
    );
  },
});

const settingsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "settings-layout",
  component: () => (
    <AuthGate requireOnboarding={false}>
      <div className="relative z-10 flex min-h-screen w-full flex-col bg-white dark:bg-[#050505] text-slate-900 dark:text-white overflow-x-hidden">
        <SettingsChrome />
        <main className="flex-grow flex flex-col relative z-10">
          <SettingsNav />
          <Outlet />
        </main>
      </div>
    </AuthGate>
  ),
});

const settingsProfileRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/profile",
  component: ProfileView,
});

const settingsProvidersRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/providers",
  component: ProvidersView,
});

const settingsModelsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/models",
  component: ModelsView,
});

const settingsAppearanceRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/appearance",
  component: AppearanceView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  notebooksRoute,
  notebookRoute,
  settingsLayoutRoute.addChildren([
    settingsProfileRoute,
    settingsProvidersRoute,
    settingsModelsRoute,
    settingsAppearanceRoute,
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
