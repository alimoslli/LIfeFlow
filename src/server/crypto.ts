import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for integration credentials (Plaid access tokens, Canvas tokens...).
 * Format: v1.<iv b64>.<tag b64>.<ciphertext b64>
 */
function key(raw = process.env.ENCRYPTION_KEY): Buffer {
  if (!raw) throw new Error("ENCRYPTION_KEY is not configured; integrations cannot store credentials.");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes, base64-encoded.");
  return buf;
}

export function encryptSecret(plaintext: string, rawKey?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(rawKey), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), ct.toString("base64")].join(".");
}

export function decryptSecret(payload: string, rawKey?: string): string {
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unrecognised ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key(rawKey), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64")), decipher.final()]).toString("utf8");
}

/**
 * Encryption at rest for personal text (Jarvis memories). Encrypts when ENCRYPTION_KEY is set;
 * reads both encrypted and older plaintext values, so existing rows keep working until re-saved.
 */
export function sealText(plaintext: string): string {
  return process.env.ENCRYPTION_KEY ? encryptSecret(plaintext) : plaintext;
}

export function openText(stored: string): string {
  if (!/^v1\.[^.]+\.[^.]+\.[^.]+$/.test(stored) || !process.env.ENCRYPTION_KEY) return stored;
  try {
    return decryptSecret(stored);
  } catch {
    return stored;
  }
}

export const isSealed = (stored: string) => /^v1\.[^.]+\.[^.]+\.[^.]+$/.test(stored);
