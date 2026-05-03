import type { StorageProvider, UploadInput, UploadResult } from "./types";

async function toBuffer(body: UploadInput["body"]): Promise<Buffer> {
  if (body instanceof Blob) return Buffer.from(await body.arrayBuffer());
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ReadableStream) {
    const reader = body.getReader();
    const parts: Uint8Array[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) parts.push(value);
    }
    return Buffer.concat(parts.map((p) => Buffer.from(p)));
  }
  return Buffer.from(body as Buffer);
}

/**
 * In-process Map-backed StorageProvider. Used by the desktop's Phase 1 stub
 * adapter (where persistence isn't required yet) and by tests. The bytes
 * live in the same process as the Hono app, so signed URLs route back to
 * `/api/files/<key>` which the files handler dispatches to `read()`.
 */
export function createMemoryStorageProvider(): StorageProvider {
  const blobs = new Map<string, { body: Buffer; contentType?: string }>();
  return {
    name: "memory",
    async upload(input: UploadInput): Promise<UploadResult> {
      const body = await toBuffer(input.body);
      blobs.set(input.key, { body, contentType: input.contentType });
      return {
        key: input.key,
        url: `/api/files/${encodeURIComponent(input.key)}`,
        provider: "memory",
      };
    },
    async read(key) {
      const entry = blobs.get(key);
      if (!entry) throw new Error(`Memory storage: key ${key} not found`);
      return entry;
    },
    async getSignedUrl(key) {
      return `/api/files/${encodeURIComponent(key)}`;
    },
    async delete(key) {
      blobs.delete(key);
    },
  };
}
