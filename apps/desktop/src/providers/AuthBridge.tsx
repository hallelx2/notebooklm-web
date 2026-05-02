import { type Auth, AuthProvider } from "@notebooklm/ui/contexts";
import { createAuthClient } from "better-auth/react";
import { type ReactNode, useMemo } from "react";

// Same-origin Better Auth client — Vite middleware mounts Hono on the same
// port so cookies just work.
const authClient = createAuthClient({ baseURL: "http://localhost:5173" });
const { signIn, signOut, signUp, useSession } = authClient;

export function AuthBridge({ children }: { children: ReactNode }) {
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
