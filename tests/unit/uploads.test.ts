import { describe, expect, it } from "vitest";
import { deflateRawSync } from "node:zlib";
import { officeText, sniffMime } from "@/server/uploads";

describe("sniffMime", () => {
  it("recognizes files by their bytes, not their names", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7\n%\xe2\xe3\n1 0 obj", "latin1"), "statement.pdf")).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "x.pdf")).toBe("image/png");
    expect(sniffMime(Buffer.from("date,amount\n2026-10-01,5"), "bank.csv")).toBe("text/csv");
    expect(sniffMime(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "fake.pdf")).toBeNull();
  });
});

// A tiny zip writer (deflated entries), enough to build real .docx and .pptx files in a test.
function zip(files: Record<string, string>): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text, "utf8"));
    const n = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(n.length, 26);
    locals.push(local, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(8, 10);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(Buffer.byteLength(text), 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

describe("officeText", () => {
  it("reads a Word file's paragraphs, entities included", () => {
    const doc = zip({
      "[Content_Types].xml": "<Types/>",
      "word/document.xml":
        '<w:document><w:body><w:p><w:r><w:t>BIO 101 Syllabus</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Quiz 1: </w:t></w:r><w:r><w:t>Sept 12 &amp; 14</w:t></w:r></w:p><w:p></w:p></w:body></w:document>',
    });
    expect(officeText(doc, "syllabus.docx")).toBe("BIO 101 Syllabus\nQuiz 1: Sept 12 & 14");
  });

  it("reads a PowerPoint file slide by slide, in order", () => {
    const deck = zip({
      "ppt/slides/slide2.xml": "<p:sld><a:p><a:r><a:t>Exam on Friday</a:t></a:r></a:p></p:sld>",
      "ppt/slides/slide1.xml": "<p:sld><a:p><a:r><a:t>Week 3</a:t></a:r></a:p><a:p><a:r><a:t>Cells</a:t></a:r></a:p></p:sld>",
    });
    expect(officeText(deck, "lecture.pptx")).toBe("Slide 1\nWeek 3\nCells\n\nSlide 2\nExam on Friday");
  });

  it("gives null for anything else: another zip, a renamed file, or no words", () => {
    expect(officeText(zip({ "a.txt": "hi" }), "notes.zip")).toBeNull();
    expect(officeText(Buffer.from("plain text"), "fake.docx")).toBeNull();
    expect(officeText(zip({ "word/document.xml": "<w:document/>" }), "empty.docx")).toBeNull();
  });
});
