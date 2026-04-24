import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

export type ServerSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;
export type ServerUser = ServerSession["user"];

/**
 * Get the current session from request cookies.
 * Returns null if not authenticated.
 */
export async function getSession() {
  const reqHeaders = await headers();
  const session = await auth.api.getSession({ headers: reqHeaders });
  return session;
}

/**
 * Require authentication. Redirects to sign-in if no session.
 * Returns the validated session (never null).
 */
export async function requireSession(): Promise<ServerSession> {
  const session = await getSession();
  if (!session?.user) {
    redirect("/auth/sign-in");
  }
  return session as ServerSession;
}

/**
 * For auth pages: redirect to /notebooks if already authenticated.
 */
export async function redirectIfAuthenticated() {
  const session = await getSession();
  if (session?.user) {
    redirect("/notebooks");
  }
}
