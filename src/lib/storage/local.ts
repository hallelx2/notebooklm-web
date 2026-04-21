import { promises as fs } from "node:fs";
import path from "node:path";
import type { StorageProvider, UploadInput, UploadResult } from "./types";

const ROOT = path.resolve(
  process.env.LOCAL_STORAGE_DIR ?? "./.storage",
);

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

export const localProvider: StorageProvider = {
  name: "local",
  async upload(input: UploadInput): Promise<UploadResult> {
    const target = path.join(ROOT, input.key);
    await ensureDir(path.dirname(target));
    await fs.writeFile(target, await toBuffer(input.body));
    return {
      key: input.key,
      url: `/api/files/${encodeURIComponent(input.key)}`,
      provider: "local",
    };
  },
  async getSignedUrl(key) {
    return `/api/files/${encodeURIComponent(key)}`;
  },
  async delete(key) {
    const target = path.join(ROOT, key);
    await fs.rm(target, { force: true });
  },
};

export async function readLocal(key: string): Promise<Buffer> {
  const target = path.join(ROOT, key);
  return fs.readFile(target);
}
