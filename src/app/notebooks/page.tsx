import { requireSession } from "@/lib/auth-server";
import { NotebooksView } from "@/module/notebooks/views/NotebooksView";

export default async function NotebooksPage() {
  const session = await requireSession();
  return <NotebooksView user={session.user} />;
}
