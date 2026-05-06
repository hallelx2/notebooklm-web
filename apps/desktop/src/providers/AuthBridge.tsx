import { type Auth, AuthProvider } from "@notebooklm/ui/contexts";
import { createAuthClient } from "better-auth/react";
import { type ReactNode, useMemo } from "react";
import { useApiBaseUrl } from "./ApiBaseUrlProvider";

export function AuthBridge({ children }: { children: ReactNode }) {
  const apiBaseUrl = useApiBaseUrl();

  // Better Auth's client constructs every fetch as `${baseURL}/api/
  // auth/...`. In dev this is the vite URL; in production it's the
  // embedded server's `127.0.0.1:<port>`, resolved at boot via the
  // preload contextBridge (see ApiBaseUrlProvider).
  //
  // useMemo so we don't construct a new client (and therefore a new
  // useSession listener) on every render. The URL is stable for the
  // app's lifetime.
  const authClient = useMemo(
    () => createAuthClient({ baseURL: apiBaseUrl }),
    [apiBaseUrl],
  );
  const { signIn, signOut, signUp, useSession } = authClient;
  const session = useSession();

  const auth: Auth = useMemo(
    () => ({
      user: session.data?.user
        ? {
            id: session.data.user.id,
            name: session.data.user.name,
            email: session.data.user.email,
            image: session.data.user.image,
            emailVerified: session.data.user.emailVerified,
          }
        : null,
      status: session.isPending
        ? "loading"
        : session.data?.user
          ? "authenticated"
          : "unauthenticated",
      async signIn(input) {
        const r = await signIn.email({
          email: input.email,
          password: input.password,
        });
        return { error: r.error?.message };
      },
      async signUp(input) {
        const r = await signUp.email({
          email: input.email,
          password: input.password,
          name: input.name,
        });
        return { error: r.error?.message };
      },
      async signOut() {
        await signOut();
      },
      async updateProfile(input) {
        try {
          await authClient.updateUser({ name: input.name });
          return {};
        } catch (err) {
          return {
            error: err instanceof Error ? err.message : "Update failed",
          };
        }
      },
    }),
    [session.data, session.isPending],
  );

  return <AuthProvider auth={auth}>{children}</AuthProvider>;
}
