import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageProvider, UploadInput, UploadResult } from "./types";

const ROOT = path.resolve(process.env.LOCAL_STORAGE_DIR ?? "./.storage");

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function toBuffer(body: UploadInput["body"]): Promise<Buffer> {
  if (body instanceof Blob) {
    return Buffer.from(await body.arrayBuffer());
  }
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
 * Build a local-filesystem StorageProvider rooted at `root`. Defaults to
 * `process.env.LOCAL_STORAGE_DIR ?? ./.storage` when called with no args,
 * which keeps the existing web behaviour. Callers (the desktop adapter) can
 * pass an explicit absolute path to force a per-user data directory.
 */
export function createLocalStorageProvider(
  root: string = ROOT,
): StorageProvider {
  const dir = path.resolve(root);
  return {
    name: "local",
    async upload(input: UploadInput): Promise<UploadResult> {
      const target = path.join(dir, input.key);
      await ensureDir(path.dirname(target));
      await fs.writeFile(target, await toBuffer(input.body));
      return {
        key: input.key,
        url: `/api/files/${encodeURIComponent(input.key)}`,
        provider: "local",
      };
    },
    async read(key: string) {
      const target = path.join(dir, key);
      const body = await fs.readFile(target);
      // Local storage doesn't track content-type; let the caller default it.
      return { body };
    },
    async getSignedUrl(key) {
      return `/api/files/${encodeURIComponent(key)}`;
    },
    async delete(key) {
      const target = path.join(dir, key);
      await fs.rm(target, { force: true });
    },
  };
}

/** Default local provider — uses LOCAL_STORAGE_DIR or ./.storage. */
export const localProvider: StorageProvider = createLocalStorageProvider();

/**
 * @deprecated use `localProvider.read(key)` (or `adapter.storage.read(key)`).
 * Kept as a re-export for the few legacy callers; new code goes through the
 * StorageProvider interface so the desktop's in-memory and the web's local
 * FS share one code path.
 */
export async function readLocal(key: string): Promise<Buffer> {
  const { body } = await localProvider.read(key);
  return body;
}
