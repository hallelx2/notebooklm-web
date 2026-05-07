"use client";

import { Button, Input, Text } from "@notebooklm/ui";
import { Link, useAuth, useRouter } from "@notebooklm/ui/contexts";
import { useEffect, useState } from "react";
import { AuthShell } from "./AuthShell";

export function SignInView() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (submitted && auth.status === "authenticated") {
      router.replace("/notebooks");
    }
  }, [submitted, auth.status, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await auth.signIn({ email, password });
    setLoading(false);
    if (res.error) {
      setErr(res.error ?? "Invalid email or password.");
      return;
    }
    setSubmitted(true);
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
            className="block text-sm font-medium text-fg mb-1.5"
          >
            Email
          </label>
          <Input
            id="email"
            type="email"
            required
            placeholder="you@domain.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            size="lg"
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-fg"
            >
              Password
            </label>
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-fg-accent hover:opacity-80 transition-opacity"
            >
              Forgot password?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            size="lg"
          />
        </div>

        {err && (
          <div className="rounded-input bg-danger/10 border border-danger/30 text-danger px-3 py-2 text-sm">
            {err}
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={loading}
          className="w-full"
        >
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>

      <Text
        variant="body"
        tone="secondary"
        className="mt-10 text-center text-sm"
      >
        Don't have an account?{" "}
        <Link
          href="/auth/sign-up"
          className="font-semibold text-fg-accent hover:opacity-80 transition-opacity"
        >
          Sign up for free
        </Link>
      </Text>
    </AuthShell>
  );
}
