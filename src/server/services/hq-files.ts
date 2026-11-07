import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { hqFiles } from "../db/schema";
import { HqError } from "../hq/validate";

/**
 * Preview pictures for decision cards (ADR 0028). An agent uploads the bytes (never a URL to fetch); the type is read
 * from the file's own first bytes, not from the name or the header; and the picture is served only to the admin.
 */

export const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
export const PREVIEW_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type PreviewType = (typeof PREVIEW_TYPES)[number];

/** The real type from the magic bytes, or null when the bytes are not a png, jpeg or webp. */
export function sniffImage(b: Uint8Array): PreviewType | null {
  const at = (i: number, ...v: number[]) => v.every((x, k) => b[i + k] === x);
  if (b.length >= 8 && at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (b.length >= 3 && at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (b.length >= 12 && at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Stores one picture. `declaredType` (the Content-Type header) must agree with what the bytes really are. */
export async function storePreview(
  db: Database,
  bytes: Uint8Array,
  declaredType?: string | null,
): Promise<{ id: string; contentType: PreviewType; size: number }> {
  if (!bytes.length) throw new HqError("The picture is empty.");
  if (bytes.length > MAX_PREVIEW_BYTES) throw new HqError("The picture is too big (max 2 MB).");
  const real = sniffImage(bytes);
  if (!real) throw new HqError("Only png, jpeg or webp pictures are accepted.");
  const declared = declaredType?.split(";")[0].trim().toLowerCase();
  if (declared && declared !== real) throw new HqError(`The file is a ${real.replace("image/", "")}, not a ${declared.replace("image/", "")}.`);
  const buf = Buffer.from(bytes);
  const [row] = await db
    .insert(hqFiles)
    .values({ contentType: real, size: buf.length, sha256: createHash("sha256").update(buf).digest("hex"), data: buf })
    .returning({ id: hqFiles.id });
  return { id: row.id, contentType: real, size: buf.length };
}

/** One stored picture for the admin-only route. Null for a bad or unknown id. */
export async function getPreview(db: Database, id: string): Promise<{ contentType: string; data: Buffer; sha256: string } | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const [r] = await db.select({ contentType: hqFiles.contentType, data: hqFiles.data, sha256: hqFiles.sha256 }).from(hqFiles).where(eq(hqFiles.id, id));
  return r ?? null;
}
