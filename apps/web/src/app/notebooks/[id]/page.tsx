import { NotebookView } from "@notebooklm/ui/views/notebook/NotebookView";
import { requireSession } from "@/lib/auth-server";

export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [, { id }] = await Promise.all([requireSession(), params]);
  return <NotebookView id={id} />;
}
