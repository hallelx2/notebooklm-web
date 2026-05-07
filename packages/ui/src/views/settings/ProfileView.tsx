"use client";

import { Button, Card, Input, Pill, Text, cn } from "@notebooklm/ui";
import { useAuth } from "@notebooklm/ui/contexts";
import { useState } from "react";
import { SettingsSection } from "./SettingsSection";

export function ProfileView() {
  const auth = useAuth();
  const user = auth.user;
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<
    { kind: "ok"; text: string } | { kind: "error"; text: string } | null
  >(null);

  if (!user) return null;

  const dirty =
    name.trim() !== (user.name ?? "").trim() && name.trim().length > 0;

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    setMessage(null);
    const r = await auth.updateProfile({ name: name.trim() });
    setSaving(false);
    if (r.error) {
      setMessage({ kind: "error", text: r.error });
    } else {
      setMessage({ kind: "ok", text: "Saved." });
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
        <Card variant="default" padding="lg" className="flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-accent flex items-center justify-center mb-4">
            {user.image ? (
              // biome-ignore lint/performance/noImgElement: avatar is a small remote image; next/image overkill
              <img
                src={user.image}
                alt=""
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-3xl font-medium text-fg-on-accent">
                {initial}
              </span>
            )}
          </div>
          <p className="font-medium text-fg truncate w-full">
            {user.name || "Unnamed"}
          </p>
          <Text
            variant="meta"
            tone="muted"
            as="span"
            className="mt-1 truncate w-full"
          >
            {user.email}
          </Text>
          {user.emailVerified ? (
            <Pill tone="success" className="mt-3">
              <span className="material-symbols-outlined text-[12px]">
                verified
              </span>
              Verified
            </Pill>
          ) : (
            <Pill tone="warning" className="mt-3">
              <span className="material-symbols-outlined text-[12px]">
                pending
              </span>
              Unverified
            </Pill>
          )}
        </Card>

        {/* Editable fields */}
        <div className="space-y-6">
          <Field label="Display name">
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="What should we call you?"
            />
          </Field>

          <Field
            label="Email"
            hint="Used for sign-in. Email changes aren't supported yet — get in touch if you need this."
          >
            <Input
              type="email"
              value={user.email}
              readOnly
              className="bg-accent-soft text-fg-muted cursor-not-allowed select-all"
            />
          </Field>

          <Field
            label="Account ID"
            hint="Internal identifier for support tickets."
          >
            <Input
              type="text"
              value={user.id}
              readOnly
              className="bg-accent-soft text-fg-muted cursor-not-allowed select-all font-mono text-xs"
            />
          </Field>

          <div className="flex items-center gap-4 pt-2">
            <Button
              variant="soft"
              size="md"
              onClick={handleSave}
              disabled={!dirty || saving}
              className="uppercase tracking-widest text-[10px] font-bold"
            >
              <span className="material-symbols-outlined text-[14px]">
                save
              </span>
              {saving ? "Saving" : "Save changes"}
            </Button>
            {message ? (
              <Text
                variant="caption"
                tone={message.kind === "ok" ? "success" : "danger"}
                as="span"
              >
                {message.text}
              </Text>
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
      <Text variant="caption" tone="muted" className="block mb-2">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text
          variant="body"
          tone="muted"
          className="block mt-1.5 text-xs font-light"
        >
          {hint}
        </Text>
      ) : null}
    </label>
  );
}
