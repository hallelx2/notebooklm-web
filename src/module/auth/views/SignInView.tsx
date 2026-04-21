"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { AuthShell } from "../components/AuthShell";

export function SignInView() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setErr(res.error.message ?? "Invalid email or password.");
      return;
    }
    router.push("/notebooks");
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to your notebooks."
      altHref="/auth/sign-up"
      altLabel="Create account"
    >
      <form onSubmit={onSubmit} className="space-y-5">
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
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-900"
            >
              Password
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="password"
            type="password"
            required
            placeholder="••••••••"
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
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-10 text-center text-sm text-slate-500">
        Don't have an account?{" "}
        <Link
          href="/auth/sign-up"
          className="font-semibold text-blue-600 hover:text-blue-700"
        >
          Sign up for free
        </Link>
      </p>
    </AuthShell>
  );
}
