import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getEncryptionKey } from "@/lib/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
export const ENCRYPTION_KEY_VERSION_CURRENT = 1;

/**
 * The shape of an encrypted secret on disk. Each field corresponds to a
 * column on the `user_provider_credentials` table.
 */
export interface EncryptedSecret {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  keyVersion: number;
}

/**
 * Encrypt a plaintext string with AES-256-GCM, binding the ciphertext to a
 * specific user via Additional Authenticated Data (AAD). Decrypting with a
 * different `aad` will fail, preventing ciphertext substitution attacks.
 */
export function encryptSecret(plaintext: string, aad: string): EncryptedSecret {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext,
    iv,
    tag,
    keyVersion: ENCRYPTION_KEY_VERSION_CURRENT,
  };
}

/**
 * Decrypt a record produced by {@link encryptSecret}. Throws if the AAD
 * does not match (e.g. someone tried to decrypt user A's secret as user B)
 * or if the key version is unsupported.
 */
export function decryptSecret(secret: EncryptedSecret, aad: string): string {
  if (secret.keyVersion !== ENCRYPTION_KEY_VERSION_CURRENT) {
    throw new Error(
      `Unsupported encryption key version ${secret.keyVersion}. ` +
        `Only version ${ENCRYPTION_KEY_VERSION_CURRENT} is currently supported.`,
    );
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, secret.iv);
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(secret.tag);
  return Buffer.concat([
    decipher.update(secret.ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/**
 * Mask an API key for display in the UI. Never return the decrypted plaintext
 * to the client -- always pass through this helper first.
 */
export function maskApiKey(key: string | null | undefined): string {
  if (!key) return "";
  const trimmed = key.trim();
  if (trimmed.length <= 8) return "••••";
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}
