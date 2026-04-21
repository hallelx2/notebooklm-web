import { NotebookView } from "@/module/notebook/views/NotebookView";

export default async function NotebookPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NotebookView id={id} />;
}
