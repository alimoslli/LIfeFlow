import { deflateRawSync } from "node:zlib";
import { expect, test } from "@playwright/test";
import { queryAsUser, signUp } from "./helpers";

/** A real (tiny) .docx: a zip holding word/document.xml. */
function docx(paragraphs: string[]): Buffer {
  const name = Buffer.from("word/document.xml");
  const xml = Buffer.from(`<w:document><w:body>${paragraphs.map((p) => `<w:p><w:r><w:t>${p}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  const data = deflateRawSync(xml);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(xml.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(xml.length, 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(46 + name.length, 12);
  end.writeUInt32LE(30 + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

// Owner, 2026-11-10: "i should be able to attach all the files needed". A Word syllabus attaches in the chat and is kept
// as its words, so the skyling can read it like a text file.
test("a Word file attaches in the chat and is kept as its words", async ({ page }) => {
  const email = await signUp(page, "Dee Docx");
  await page.goto("/jarvis");
  const input = page.locator('.lf-composer input[type="file"]');
  // a file picked before the page is live is lost: wait for React to own the field first
  await expect.poll(() => input.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps"))), { timeout: 60_000 }).toBe(true);
  await input.setInputFiles({
    name: "BIO 101 syllabus.docx",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    buffer: docx(["BIO 101 Syllabus", "Quiz 1: September 12"]),
  });
  await expect(page.getByText("BIO 101 syllabus.docx").first()).toBeVisible();
  await expect(page.getByText(/can't be read|Couldn't upload/)).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (
          await queryAsUser<{ mime_type: string; t: string }>(
            email,
            "select mime_type, convert_from(decode(data_base64, 'base64'), 'UTF8') as t from attachments",
          )
        )[0],
    )
    .toEqual({ mime_type: "text/plain", t: "BIO 101 Syllabus\nQuiz 1: September 12" });
});
