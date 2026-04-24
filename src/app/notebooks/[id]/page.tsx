import { requireSession } from "@/lib/auth-server";
import { NotebookView } from "@/module/notebook/views/NotebookView";

export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, { id }] = await Promise.all([requireSession(), params]);
  return <NotebookView id={id} user={session.user} />;
}
