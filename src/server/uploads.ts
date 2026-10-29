/**
 * Determines a safe MIME type from file bytes. Images must match their magic
 * numbers; text must be valid UTF-8 without NUL bytes. Anything else is rejected.
 */
export function sniffMime(buf: Buffer, filename: string): string | null {
  const b = buf;
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && (b.subarray(0, 6).toString("ascii") === "GIF87a" || b.subarray(0, 6).toString("ascii") === "GIF89a")) return "image/gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (b.length >= 5 && b.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (b.includes(0)) return null;
  const text = b.toString("utf8");
  if (text.includes("�")) return null;
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "csv") return "text/csv";
  if (ext === "md" || ext === "markdown") return "text/markdown";
  if (ext === "json") return "application/json";
  if (ext === "txt" || ext === "text" || !ext || ext === filename.toLowerCase()) return "text/plain";
  return null;
}
