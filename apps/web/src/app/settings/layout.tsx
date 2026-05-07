import { SettingsChrome } from "@notebooklm/ui/views/settings/SettingsChrome";
import {
  SettingsNav,
  SettingsSidebar,
} from "@notebooklm/ui/views/settings/SettingsNav";
import { requireSession } from "@/lib/auth-server";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireSession();
  return (
    <div className="relative z-10 flex min-h-screen w-full flex-col bg-canvas text-fg overflow-x-hidden">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[45rem] h-[45rem] bg-accent-soft blur-[120px] rounded-full" />
      </div>
      <SettingsChrome />
      <SettingsNav />
      <div className="relative z-10 flex flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 md:px-10">
        <SettingsSidebar />
        <main className="flex-1 min-w-0 lg:pl-10">{children}</main>
      </div>
    </div>
  );
}
