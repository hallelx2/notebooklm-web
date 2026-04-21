import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, UploadInput, UploadResult } from "./types";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
const publicBase = process.env.R2_PUBLIC_BASE_URL;

function requireR2Config() {
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.",
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

function client() {
  const cfg = requireR2Config();
  return new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export const r2Provider: StorageProvider = {
  name: "r2",
  async upload(input: UploadInput): Promise<UploadResult> {
    const cfg = requireR2Config();
    const body =
      input.body instanceof Blob
        ? Buffer.from(await input.body.arrayBuffer())
        : (input.body as Buffer | Uint8Array);
    await client().send(
      new PutObjectCommand({
        Bucket: cfg.bucket,
        Key: input.key,
        Body: body,
        ContentType: input.contentType,
      }),
    );
    const url = publicBase
      ? `${publicBase.replace(/\/$/, "")}/${input.key}`
      : await this.getSignedUrl(input.key);
    return { key: input.key, url, provider: "r2" };
  },
  async getSignedUrl(key, expiresInSeconds = 60 * 60) {
    const cfg = requireR2Config();
    return getSignedUrl(
      client(),
      new GetObjectCommand({ Bucket: cfg.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  },
  async delete(key) {
    const cfg = requireR2Config();
    await client().send(
      new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
  },
};
