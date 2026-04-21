export type UploadInput = {
  key: string;
  body: Buffer | Uint8Array | Blob | ReadableStream;
  contentType?: string;
};

export type StorageProviderName = "r2" | "supabase" | "local";

export type UploadResult = {
  key: string;
  url: string;
  provider: StorageProviderName;
};

export interface StorageProvider {
  name: StorageProviderName;
  upload(input: UploadInput): Promise<UploadResult>;
  getSignedUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}
