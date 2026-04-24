import { auth } from "@/lib/auth";
import { createHNSWIndex } from "@/db/migrate-hnsw";

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session?.user) return new Response("Unauthorized", { status: 401 });

  await createHNSWIndex();
  return Response.json({ ok: true, message: "HNSW index created" });
}
