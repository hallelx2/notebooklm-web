import { readLocal } from "@/lib/storage/local";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: keyParts } = await params;
  const key = keyParts.map((p) => decodeURIComponent(p)).join("/");
  try {
    const buf = await readLocal(key);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
