import type { StorageProvider, UploadInput, UploadResult } from "./types";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const bucket = process.env.SUPABASE_BUCKET ?? "sources";

function requireConfig() {
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.",
    );
  }
  return { url, serviceKey, bucket };
}

async function call(
  method: string,
  path: string,
  body?: BodyInit,
  extraHeaders?: Record<string, string>,
) {
  const cfg = requireConfig();
  const res = await fetch(`${cfg.url}/storage/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.serviceKey}`,
      apikey: cfg.serviceKey,
      ...extraHeaders,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`Supabase storage ${method} ${path} failed: ${res.status}`);
  }
  return res;
}

export const supabaseProvider: StorageProvider = {
  name: "supabase",
  async upload(input: UploadInput): Promise<UploadResult> {
    const cfg = requireConfig();
    const body =
      input.body instanceof Blob
        ? input.body
        : new Blob([input.body as unknown as BlobPart], {
            type: input.contentType ?? "application/octet-stream",
          });
    await call(
      "POST",
      `object/${cfg.bucket}/${encodeURIComponent(input.key)}`,
      body,
      { "x-upsert": "true" },
    );
    const url = `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${encodeURIComponent(input.key)}`;
    return { key: input.key, url, provider: "supabase" };
  },
  async getSignedUrl(key, expiresInSeconds = 60 * 60) {
    const cfg = requireConfig();
    const res = await call(
      "POST",
      `object/sign/${cfg.bucket}/${encodeURIComponent(key)}`,
      JSON.stringify({ expiresIn: expiresInSeconds }),
      { "Content-Type": "application/json" },
    );
    const { signedURL } = (await res.json()) as { signedURL: string };
    return `${cfg.url}/storage/v1${signedURL}`;
  },
  async delete(key) {
    const cfg = requireConfig();
    await call("DELETE", `object/${cfg.bucket}/${encodeURIComponent(key)}`);
  },
};
