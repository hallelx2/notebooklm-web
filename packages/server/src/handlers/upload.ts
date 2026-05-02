import { notebooks, sources } from "@notebooklm/core/db/schema";
import { ingestFile } from "@notebooklm/core/ingest";
import { and, eq } from "drizzle-orm";
import type { PlatformAdapter } from "../adapter";

export async function uploadHandler(
  req: Request,
  adapter: PlatformAdapter,
): Promise<Response> {
  const session = await adapter.auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  const form = await req.formData();
  const notebookId = String(form.get("notebookId") ?? "");
  const file = form.get("file");
  if (!notebookId || !(file instanceof File)) {
    return new Response("Missing notebookId or file", { status: 400 });
  }

  const [nb] = await adapter.db
    .select()
    .from(notebooks)
    .where(
      and(eq(notebooks.id, notebookId), eq(notebooks.userId, session.user.id)),
    )
    .limit(1);
  if (!nb) return new Response("Notebook not found", { status: 404 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const key = `notebooks/${notebookId}/${Date.now()}-${file.name}`;
  await adapter.storage.upload({
    key,
    body: buffer,
    contentType: file.type || "application/octet-stream",
  });

  const [row] = await adapter.db
    .insert(sources)
    .values({
      notebookId,
      kind: "file",
      title: file.name,
      mimeType: file.type || null,
      size: file.size,
      storageProvider: adapter.storage.name,
      storageKey: key,
      status: "pending",
    })
    .returning();

  ingestFile({
    userId: session.user.id,
    sourceId: row.id,
    notebookId,
    buffer,
    mimeType: file.type,
    filename: file.name,
  }).catch((err) => console.error("ingestFile failed", err));

  return Response.json(row);
}
