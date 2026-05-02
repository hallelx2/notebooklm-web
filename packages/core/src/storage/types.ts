export type UploadInput = {
  key: string;
  body: Buffer | Uint8Array | Blob | ReadableStream;
  contentType?: string;
};

export type StorageProviderName = "r2" | "supabase" | "local" | "memory";

export type UploadResult = {
  key: string;
  url: string;
  provider: StorageProviderName;
};

/**
 * The single interface every storage backend implements. Both apps and the
 * Hono handlers consume `StorageProvider` exclusively — no provider-specific
 * branching ever leaves this directory.
 *
 * - `upload`: persist the blob, return a public/signed URL the UI can hit.
 * - `read`: fetch the blob for server-side consumers (the `/api/files`
 *   handler routes through this so the desktop's in-memory storage and the
 *   web's local-FS storage both work uniformly).
 * - `getSignedUrl`: stable URL the UI uses for direct fetches; for local
 *   modes this is the same `/api/files/<key>` route that delegates to read().
 * - `delete`: drop the blob.
 */
export interface StorageProvider {
  name: StorageProviderName;
  upload(input: UploadInput): Promise<UploadResult>;
  read(key: string): Promise<{ body: Buffer; contentType?: string }>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
