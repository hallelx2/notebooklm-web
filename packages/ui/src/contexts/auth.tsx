import { createContext, type ReactNode, useContext } from "react";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  emailVerified?: boolean;
};

export type Auth = {
  user: AuthUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  signIn(input: { email: string; password: string }): Promise<{ error?: string }>;
  signUp(input: {
    email: string;
    password: string;
    name: string;
  }): Promise<{ error?: string }>;
  signOut(): Promise<void>;
  updateProfile(input: { name: string }): Promise<{ error?: string }>;
};

const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const a = useContext(AuthContext);
  if (!a) {
    throw new Error(
      "AuthProvider missing. Wrap your app with the platform's AuthBridge.",
    );
  }
  return a;
}

export function AuthProvider({
  auth,
  children,
}: {
  auth: Auth;
  children: ReactNode;
}) {
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}
