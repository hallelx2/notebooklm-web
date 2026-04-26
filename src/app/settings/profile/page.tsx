import { requireSession } from "@/lib/auth-server";
import { ProfileView } from "@/module/settings/views/ProfileView";

export default async function ProfilePage() {
  const session = await requireSession();
  return <ProfileView user={session.user} />;
}
