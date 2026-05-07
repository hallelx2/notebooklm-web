import { NotebooksAppChrome } from "@notebooklm/ui/views/notebooks/NotebooksAppChrome";
import { NotebooksView } from "@notebooklm/ui/views/notebooks/NotebooksView";
import { requireSession } from "@/lib/auth-server";

export default async function NotebooksPage() {
  await requireSession();
  // Web composes top chrome above the view. Desktop swaps in AppDock at
  // the bottom instead — see apps/desktop/src/routes.tsx.
  return (
    <>
      <NotebooksAppChrome />
      <NotebooksView />
    </>
  );
}
