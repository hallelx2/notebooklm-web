import type { PlatformAdapter } from "../adapter";

/**
 * Serve a file from the platform's storage provider. The web's local-FS
 * setup, the desktop's in-memory stub, and any cloud provider (Supabase,
 * R2) all flow through the same `adapter.storage.read()` method so the
 * handler stays platform-agnostic.
 */
export async function filesHandler(
  req: Request,
  adapter: PlatformAdapter,
): Promise<Response> {
  const url = new URL(req.url);
  // Path is `/api/files/<key parts joined with />`. Each segment is URL-encoded
  // by the StorageProvider.getSignedUrl implementation; decode each part.
  const key = url.pathname
    .replace(/^\/api\/files\//, "")
    .split("/")
    .map((p) => decodeURIComponent(p))
    .join("/");
  if (!key) return new Response("Missing key", { status: 400 });
  try {
    const { body, contentType } = await adapter.storage.read(key);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=0",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
