"use client";

import { Link, useAuth, useRouter } from "@notebooklm/ui/contexts";
import { useEffect, useState } from "react";
import { AuthShell } from "./AuthShell";

export function SignUpView() {
  const router = useRouter();
  const auth = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Same dance as SignInView: wait for `useSession` to actually
  // reflect the new authenticated state before navigating, otherwise
  // AuthGate sees `auth.status === "unauthenticated"` for one render
  // cycle and bounces us back here. AuthGate also handles the
  // "authenticated but not onboarded" case, so /notebooks is fine
  // either way as the post-signup target.
  useEffect(() => {
    if (submitted && auth.status === "authenticated") {
      router.replace("/notebooks");
    }
  }, [submitted, auth.status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await auth.signUp({ email, password, name });
    setLoading(false);
    if (res.error) {
      setErr(res.error ?? "Could not create your account.");
      return;
    }
    setSubmitted(true);
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Start your first notebook in under a minute."
      altHref="/auth/sign-in"
      altLabel="Sign in"
      quote={{
        text: "I spent years building notebooks the hard way. This one actually reads with me.",
        author: "Halleluyah O.",
        role: "Founder, Hachiago",
      }}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-slate-900 mb-1.5"
          >
            Name
          </label>
          <input
            id="name"
            required
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-slate-900 mb-1.5"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors text-sm"
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-slate-900 mb-1.5"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 outline-none transition-colors text-sm"
          />
        </div>

        {err && (
          <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full h-12 rounded-xl bg-slate-900 text-white font-medium hover:bg-slate-800 shadow-sm transition-all hover:-translate-y-0.5 disabled:opacity-60 disabled:translate-y-0"
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        <p className="text-xs text-slate-500 text-center">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </form>

      <p className="mt-10 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link
          href="/auth/sign-in"
          className="font-semibold text-blue-600 hover:text-blue-700"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
