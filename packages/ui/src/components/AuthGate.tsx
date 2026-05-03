"use client";

import { type ReactNode, useEffect } from "react";
import { useAuth, useRouter } from "../contexts";
import { trpc } from "../trpc/client";
import { LoadingScreen } from "./LoadingScreen";

/**
 * Shared client-side gate that handles three states a protected view should
 * never have to think about itself:
 *
 *   - session still loading        → show LoadingScreen
 *   - unauthenticated              → redirect to /auth/sign-in
 *   - authenticated but not onboarded → redirect to /settings/providers?onboarding=1
 *
 * Set `requireOnboarding={false}` for routes the user must reach BEFORE
 * onboarding is complete (the settings tree, sign-out flows). Otherwise the
 * onboarding redirect fires and the user can never escape it.
 *
 * The web has an equivalent server-side check in
 * apps/web/src/app/notebooks/layout.tsx that runs at SSR time. AuthGate is
 * the client-side counterpart used by the desktop's TanStack Router (which
 * has no SSR phase) and as a defensive layer on the web during the brief
 * hydration window where useAuth() reports "loading".
 */
export function AuthGate({
  children,
  requireOnboarding = true,
}: {
  children: ReactNode;
  requireOnboarding?: boolean;
}) {
  const auth = useAuth();
  const router = useRouter();

  // Pull the AI config only when we both need it AND have a session — keeps
  // the request count flat for unauth flows and the settings tree.
  const aiConfigQuery = trpc.aiConfig.get.useQuery(undefined, {
    enabled: requireOnboarding && auth.status === "authenticated",
    staleTime: 30_000,
    retry: false,
  });

  // Bounce unauthenticated users.
  useEffect(() => {
    if (auth.status === "unauthenticated") {
      router.replace("/auth/sign-in");
    }
  }, [auth.status, router]);

  // Bounce authenticated-but-not-onboarded users.
  useEffect(() => {
    if (!requireOnboarding) return;
    if (auth.status !== "authenticated") return;
    if (aiConfigQuery.isPending) return;
    if (aiConfigQuery.data && !aiConfigQuery.data.isOnboarded) {
      router.replace("/settings/providers?onboarding=1");
    }
  }, [
    auth.status,
    requireOnboarding,
    aiConfigQuery.isPending,
    aiConfigQuery.data,
    router,
  ]);

  // Loading states. Order matters: check session first, then onboarding.
  if (auth.status === "loading") {
    return <LoadingScreen message="Restoring session" />;
  }
  if (auth.status === "unauthenticated") {
    return <LoadingScreen message="Redirecting to sign in" />;
  }
  if (requireOnboarding) {
    if (aiConfigQuery.isPending) {
      return <LoadingScreen message="Checking your setup" />;
    }
    if (aiConfigQuery.data && !aiConfigQuery.data.isOnboarded) {
      return (
        <LoadingScreen
          message="Setup required"
          hint="Configuring your AI providers — redirecting to settings."
        />
      );
    }
  }

  return <>{children}</>;
}
