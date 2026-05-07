"use client";

import { Button, Input, Text } from "@notebooklm/ui";
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
            className="block text-sm font-medium text-fg mb-1.5"
          >
            Name
          </label>
          <Input
            id="name"
            required
            placeholder="Ada Lovelace"
            value={name}
            onChange={(e) => setName(e.target.value)}
            size="lg"
          />
        </div>

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
          <label
            htmlFor="password"
            className="block text-sm font-medium text-fg mb-1.5"
          >
            Password
          </label>
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            placeholder="At least 8 characters"
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
          {loading ? "Creating..." : "Create account"}
        </Button>

        <Text variant="body" tone="muted" className="text-xs text-center">
          By continuing you agree to our{" "}
          <Link href="/terms" className="underline underline-offset-2">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy policy
          </Link>
          .
        </Text>
      </form>

      <Text
        variant="body"
        tone="secondary"
        className="mt-10 text-center text-sm"
      >
        Already have an account?{" "}
        <Link
          href="/auth/sign-in"
          className="font-semibold text-fg-accent hover:opacity-80 transition-opacity"
        >
          Sign in
        </Link>
      </Text>
    </AuthShell>
  );
}
