import { SettingsChrome } from "@notebooklm/ui/views/settings/SettingsChrome";
import { SettingsNav } from "@notebooklm/ui/views/settings/SettingsNav";
import { requireSession } from "@/lib/auth-server";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return (
    <div className="relative z-10 flex min-h-screen w-full flex-col bg-white dark:bg-[#050505] text-slate-900 dark:text-white overflow-x-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute left-12 top-0 bottom-0 w-[1px] bg-slate-200 dark:bg-white/5 hidden md:block" />
        <div className="absolute right-12 top-0 bottom-0 w-[1px] bg-slate-200 dark:bg-white/5 hidden md:block" />
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[45rem] h-[45rem] bg-blue-400/15 dark:bg-blue-500/10 blur-[120px] rounded-full" />
      </div>
      <SettingsChrome />
      <main className="flex-grow flex flex-col relative z-10">
        <SettingsNav />
        {children}
      </main>
    </div>
  );
}
