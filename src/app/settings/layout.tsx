import Link from "next/link";
import { requireSession } from "@/lib/auth-server";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark">
      <header className="border-b border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/notebooks"
              className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white inline-flex items-center gap-1"
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 18 }}
              >
                arrow_back
              </span>
              Back to notebooks
            </Link>
          </div>
          <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            Settings
          </h1>
          <div className="w-32" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <nav className="flex gap-2 mb-8 border-b border-border-light dark:border-border-dark">
          <SettingsNavLink href="/settings/providers" label="Providers" />
          <SettingsNavLink href="/settings/models" label="Active models" />
        </nav>
        {children}
      </main>
    </div>
  );
}

function SettingsNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border-b-2 border-transparent hover:border-indigo-500 transition-colors -mb-px"
    >
      {label}
    </Link>
  );
}
