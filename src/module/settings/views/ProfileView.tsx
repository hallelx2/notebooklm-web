"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import type { ServerUser } from "@/lib/auth-server";
import { SettingsSection } from "../components/SettingsSection";

export function ProfileView({ user }: { user: ServerUser }) {
  const [name, setName] = useState(user.name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    { kind: "ok"; text: string } | { kind: "error"; text: string } | null
  >(null);

  const dirty =
    name.trim() !== (user.name ?? "").trim() && name.trim().length > 0;

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      await authClient.updateUser({ name: name.trim() });
      setMessage({ kind: "ok", text: "Saved." });
    } catch (err) {
      setMessage({
        kind: "error",
        text: err instanceof Error ? err.message : "Update failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  const initial = (user.name?.[0] ?? user.email[0] ?? "?").toUpperCase();

  return (
    <SettingsSection
      tagline="Settings · Profile"
      title="Your Profile"
      description="Your display name and email. Used across the app and on every notebook you create."
    >
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 lg:gap-10">
        {/* Avatar + summary */}
        <div className="border border-slate-200 dark:border-white/10 p-6 flex flex-col items-center text-center bg-white/60 dark:bg-white/[0.02]">
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
            {user.image ? (
              // biome-ignore lint/performance/noImgElement: avatar is a small remote image; next/image overkill
              <img
                src={user.image}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-3xl font-medium text-white">{initial}</span>
            )}
          </div>
          <p className="font-medium text-slate-900 dark:text-white truncate w-full">
            {user.name || "Unnamed"}
          </p>
          <p className="mt-1 text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-zinc-500 truncate w-full">
            {user.email}
          </p>
          {user.emailVerified ? (
            <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              <span className="material-symbols-outlined text-[12px]">
                verified
              </span>
              Verified
            </span>
          ) : (
            <span className="mt-3 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
              <span className="material-symbols-outlined text-[12px]">
                pending
              </span>
              Unverified
            </span>
          )}
        </div>

        {/* Editable fields */}
        <div className="space-y-6">
          <Field label="Display name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className="w-full h-11 bg-white dark:bg-[#0a0a0a] border border-slate-300 dark:border-white/20 px-4 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 focus:outline-none focus:border-blue-500 dark:focus:border-emerald-500 transition-colors"
              placeholder="What should we call you?"
            />
          </Field>

          <Field
            label="Email"
            hint="Used for sign-in. Email changes aren't supported yet — get in touch if you need this."
          >
            <input
              type="email"
              value={user.email}
              readOnly
              className="w-full h-11 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 px-4 text-sm text-slate-500 dark:text-zinc-500 cursor-not-allowed select-all"
            />
          </Field>

          <Field
            label="Account ID"
            hint="Internal identifier for support tickets."
          >
            <input
              type="text"
              value={user.id}
              readOnly
              className="w-full h-11 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 px-4 text-xs font-mono text-slate-500 dark:text-zinc-500 cursor-not-allowed select-all"
            />
          </Field>

          <div className="flex items-center gap-4 pt-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="flex items-center justify-center gap-2 h-11 px-6 border border-emerald-500/70 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-500 hover:text-white dark:hover:text-black transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[14px]">
                save
              </span>
              {saving ? "Saving" : "Save changes"}
            </button>
            {message ? (
              <span
                className={`text-[10px] font-bold uppercase tracking-widest ${
                  message.kind === "ok"
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-red-700 dark:text-red-400"
                }`}
              >
                {message.text}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </SettingsSection>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: input passed via children, biome can't see through it
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400 mb-2">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="block mt-1.5 text-xs text-slate-500 dark:text-zinc-500 font-light">
          {hint}
        </span>
      ) : null}
    </label>
  );
}
