import { AppDock } from "@notebooklm/ui/components/AppDock";
import { AuthGate } from "@notebooklm/ui/components/AuthGate";
import { ThemeProvider } from "@notebooklm/ui/components/ThemeProvider";
import { SignInView } from "@notebooklm/ui/views/auth/SignInView";
import { SignUpView } from "@notebooklm/ui/views/auth/SignUpView";
import { NotebookView } from "@notebooklm/ui/views/notebook/NotebookView";
import { NotebooksAppChrome } from "@notebooklm/ui/views/notebooks/NotebooksAppChrome";
import { NotebooksView } from "@notebooklm/ui/views/notebooks/NotebooksView";
import { OnboardingView } from "@notebooklm/ui/views/onboarding/OnboardingView";
import { AppearanceView } from "@notebooklm/ui/views/settings/AppearanceView";
import { CodingAgentsView } from "@notebooklm/ui/views/settings/CodingAgentsView";
import { ModelsView } from "@notebooklm/ui/views/settings/ModelsView";
import { ProfileView } from "@notebooklm/ui/views/settings/ProfileView";
import { ProvidersView } from "@notebooklm/ui/views/settings/ProvidersView";
import {
  SettingsNav,
  SettingsSidebar,
} from "@notebooklm/ui/views/settings/SettingsNav";
import { WebSearchView } from "@notebooklm/ui/views/settings/WebSearchView";
import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { ApiBaseUrlGate } from "./providers/ApiBaseUrlProvider";
import { AuthBridge } from "./providers/AuthBridge";
import { RouterBridge } from "./providers/RouterBridge";
import { TransportBridge } from "./providers/TransportBridge";
import { UpdateBanner } from "./providers/UpdateBanner";

/**
 * Stable named components for every route.
 *
 * Why named functions instead of `component: () => <X />`:
 *   TanStack Router's render flow re-evaluates parent routes on every
 *   navigation. With an inline arrow assigned to `component:`, the
 *   identity of the component changes on each render — React's strict
 *   reconciler (especially in React 19) treats this as "different
 *   component", unmounts the old subtree, and mounts a new one. Under
 *   the same conditions described in ThemeProvider.tsx (raw DOM
 *   mutations from libraries that touch the document outside React's
 *   tree), the unmount can fail silently, leaving the previous tree
 *   stacked underneath the new one — the symptom is a page rendered
 *   twice top-to-bottom.
 *
 *   Naming the components fixes this: same identity across every
 *   render means React reuses the existing fiber tree.
 */

function RootShell() {
  // Bridges live INSIDE the TanStack Router so RouterBridge can read its
  // hooks. ThemeProvider sits at the top; the rest are wired in the same
  // order as apps/web's layout.
  //
  // ApiBaseUrlGate sits ABOVE TransportBridge + AuthBridge because both
  // need the embedded API server's URL before constructing their
  // respective clients (httpBatchLink + Better Auth fetch). The gate
  // resolves the URL once via preload IPC and renders a brief
  // "Connecting…" placeholder until it's ready.
  return (
    <ThemeProvider>
      <RouterBridge>
        <ApiBaseUrlGate>
          <TransportBridge>
            <AuthBridge>
              <UpdateBanner />
              <Outlet />
            </AuthBridge>
          </TransportBridge>
        </ApiBaseUrlGate>
      </RouterBridge>
    </ThemeProvider>
  );
}

const rootRoute = createRootRoute({
  component: RootShell,
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

// First-launch wizard. AuthGate redirects every authenticated-but-not-
// onboarded user here. We use `requireOnboarding={false}` because, by
// definition, the user IS not onboarded yet — the wizard's job is to
// flip that flag.
function OnboardingShell() {
  return (
    <AuthGate requireOnboarding={false}>
      <OnboardingView />
    </AuthGate>
  );
}

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingShell,
});

// AuthGate enforces "must be signed in AND onboarded" before notebook
// surfaces. The settings tree below uses requireOnboarding={false} so the
// user can actually complete onboarding without being bounced out of it.
function NotebooksShell() {
  // /notebooks gets the top-bar chrome (logo · email · settings · theme
  // · sign-out) instead of the side dock. Reasons:
  //   - On viewports where the centered max-w-[1400px] content extends
  //     close to the left edge, the dock visually overlaps notebook
  //     cards. The top bar avoids the conflict entirely.
  //   - The Library page is the user's "home" surface; a familiar
  //     top-bar feels more right-place-right-time than the
  //     dock-on-top-of-content artefact.
  // Side dock returns on /notebooks/[id] and /settings/* where
  // top-side real estate is already spoken for.
  return (
    <AuthGate>
      <NotebooksAppChrome />
      <NotebooksView />
    </AuthGate>
  );
}

const notebooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notebooks",
  component: NotebooksShell,
});

function NotebookShell() {
  const { id } = notebookRoute.useParams();
  return (
    <AuthGate>
      <div className="pl-20">
        <NotebookView id={id} />
      </div>
      <AppDock />
    </AuthGate>
  );
}

const notebookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notebooks/$id",
  component: NotebookShell,
});

/**
 * Settings layout — vertical AppDock on the left edge, settings
 * sidebar nav next to it, content right.
 *
 * No pl-20 on the wrapper: the inner `max-w-[1400px] mx-auto` already
 * centers the sidebar+content within the viewport, so the dock floats
 * in the natural left gutter.
 */
function SettingsLayoutShell() {
  // Already on /settings/* — hide the dock's Settings cog (the sidebar
  // and the active-section dot already make it clear where you are).
  return (
    <AuthGate requireOnboarding={false}>
      <div className="relative z-10 flex min-h-screen w-full flex-col bg-canvas text-fg overflow-x-hidden">
        <SettingsNav />
        <div className="relative z-10 flex flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 md:px-10">
          <SettingsSidebar />
          <main className="flex-1 min-w-0 lg:pl-10 pb-12">
            <Outlet />
          </main>
        </div>
        <AppDock showSettings={false} />
      </div>
    </AuthGate>
  );
}

const settingsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "settings-layout",
  component: SettingsLayoutShell,
});

// Bare `/settings` -- shared UI components (gear icon in NotebooksView,
// onboarding redirects, etc.) link here without picking a sub-tab. The
// web app handles this with a Next.js page at `apps/web/src/app/settings/page.tsx`
// that redirects to `/settings/profile`; the desktop equivalent lives here.
// Without this route, clicking the gear icon hits TanStack Router's
// notFoundError because no /settings/* path matches "/settings" exactly.
const settingsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  beforeLoad: () => {
    throw redirect({ to: "/settings/profile" });
  },
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

const settingsCodingAgentsRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/coding-agents",
  component: CodingAgentsView,
});

const settingsAppearanceRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/appearance",
  component: AppearanceView,
});

const settingsWebSearchRoute = createRoute({
  getParentRoute: () => settingsLayoutRoute,
  path: "/settings/web-search",
  component: WebSearchView,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  signInRoute,
  signUpRoute,
  onboardingRoute,
  notebooksRoute,
  notebookRoute,
  settingsIndexRoute,
  settingsLayoutRoute.addChildren([
    settingsProfileRoute,
    settingsProvidersRoute,
    settingsModelsRoute,
    settingsCodingAgentsRoute,
    settingsWebSearchRoute,
    settingsAppearanceRoute,
  ]),
]);

// Hash history (`#/notebooks` etc.) instead of browser history. Required
// for the packaged build: Electron loads the renderer via `loadFile`, so
// `window.location` is `file:///.../dist/index.html`, and the router would
// otherwise try to match `/C:/.../dist/index.html` against the route tree
// and 404 ("Not Found"). Hash history puts the route after `#`, which the
// file:// loader leaves untouched.
//
// In dev (`loadURL('http://localhost:5173')`) hash history still works —
// just shows up as `localhost:5173/#/notebooks` in the address bar. No
// effect on apps/web, which is its own Next.js app.
const hashHistory = createHashHistory();

// Plain URL-encoded search params, NOT TanStack's default JSON-wrapped
// form. Default `stringifySearch` round-trips through `JSON.stringify` /
// `JSON.parse` for symmetry, so any string value that looks like JSON
// (including bare numbers) gets wrapped: `{ onboard: "1" }` becomes
// `?onboard=%221%22` — the literal string `"1"` with quotes baked in.
//
// The reader side uses plain `URLSearchParams`
// (NotebookView.tsx pulls `?onboard=1` from `window.location.hash`),
// which would then return the literal `"1"` (with quotes) and the
// `=== "1"` check fails. The result is the source-add modal silently
// not opening when a notebook is freshly created.
//
// Replacing with a no-JSON serializer keeps every value as its string
// representation. Aligns the writer (RouterBridge.parseHref →
// tan.navigate({ search })) with what NotebookView's reader expects.
function stringifySearch(search: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : "";
}

function parseSearch(searchStr: string): Record<string, string> {
  const trimmed = searchStr.startsWith("?") ? searchStr.slice(1) : searchStr;
  const params = new URLSearchParams(trimmed);
  const out: Record<string, string> = {};
  for (const [key, value] of params) out[key] = value;
  return out;
}

export const router = createRouter({
  routeTree,
  history: hashHistory,
  parseSearch,
  stringifySearch,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
