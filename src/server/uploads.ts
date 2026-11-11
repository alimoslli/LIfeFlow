import { inflateRawSync } from "node:zlib";
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

/**
 * The words in a Word (.docx) or PowerPoint (.pptx) file, so the skyling can read a syllabus or class slides (owner,
 * 2026-11-10: "i should be able to attach all the files needed"). Both are zip files of XML: the text is pulled out
 * here, and the file is kept as plain text, which `read_attachment` already reads. Bounded: at most 200 entries looked at
 * and 4 MB unpacked in all, so a crafted file can't blow up. Anything else, or a file with no words, gives null.
 */
export function officeText(buf: Buffer, filename: string): string | null {
  const ext = filename.toLowerCase().split(".").pop();
  if ((ext !== "docx" && ext !== "pptx") || buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) return null;
  // the end-of-central-directory record sits in the last 64 KB
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--)
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) return null;
  const count = Math.min(buf.readUInt16LE(eocd + 10), 200);
  let at = buf.readUInt32LE(eocd + 16);
  const entries: { name: string; method: number; size: number; offset: number }[] = [];
  for (let i = 0; i < count && at + 46 <= buf.length && buf.readUInt32LE(at) === 0x02014b50; i++) {
    const n = buf.readUInt16LE(at + 28);
    entries.push({
      method: buf.readUInt16LE(at + 10),
      size: buf.readUInt32LE(at + 20),
      offset: buf.readUInt32LE(at + 42),
      name: buf.subarray(at + 46, at + 46 + n).toString("utf8"),
    });
    at += 46 + n + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  let budget = 4 * 1024 * 1024;
  const read = (e: (typeof entries)[number]): string | null => {
    if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) return null;
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
    const data = buf.subarray(start, start + e.size);
    try {
      const out = e.method === 0 ? data : e.method === 8 ? inflateRawSync(data, { maxOutputLength: budget }) : null;
      if (!out) return null;
      budget -= out.length;
      return budget > 0 ? out.toString("utf8") : null;
    } catch {
      return null;
    }
  };
  const decode = (s: string) =>
    s
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&amp;/g, "&");
  // one line per paragraph: the runs of text inside it, joined
  const paragraphs = (xml: string, p: string, t: string) =>
    [...xml.matchAll(new RegExp(`<${p}[ >][\\s\\S]*?</${p}>`, "g"))]
      .map((m) => [...m[0].matchAll(new RegExp(`<${t}(?: [^>]*)?>([^<]*)</${t}>`, "g"))].map((r) => decode(r[1])).join(""))
      .filter((line) => line.trim());
  let lines: string[] = [];
  if (ext === "docx") {
    const doc = entries.find((e) => e.name === "word/document.xml");
    const xml = doc && read(doc);
    if (xml) lines = paragraphs(xml, "w:p", "w:t");
  } else {
    const slides = entries
      .map((e) => ({ e, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(e.name)?.[1]) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => a.n - b.n);
    for (const { e, n } of slides) {
      const xml = read(e);
      const words = xml ? paragraphs(xml, "a:p", "a:t") : [];
      if (words.length) lines.push(`Slide ${n}`, ...words, "");
    }
  }
  const text = lines.join("\n").trim();
  return text ? text.slice(0, 1024 * 1024) : null;
}
