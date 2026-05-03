import { ProfileView } from "@notebooklm/ui/views/settings/ProfileView";
import { requireSession } from "@/lib/auth-server";

export default async function ProfilePage() {
  await requireSession();
  return <ProfileView />;
}
