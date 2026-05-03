import { NotebooksView } from "@notebooklm/ui/views/notebooks/NotebooksView";
import { requireSession } from "@/lib/auth-server";

export default async function NotebooksPage() {
  await requireSession();
  return <NotebooksView />;
}
