import { describe, expect, it } from "vitest";
import { sniffMime } from "@/server/uploads";

describe("sniffMime", () => {
  it("recognizes files by their bytes, not their names", () => {
    expect(sniffMime(Buffer.from("%PDF-1.7\n%\xe2\xe3\n1 0 obj", "latin1"), "statement.pdf")).toBe("application/pdf");
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "x.pdf")).toBe("image/png");
    expect(sniffMime(Buffer.from("date,amount\n2026-10-01,5"), "bank.csv")).toBe("text/csv");
    expect(sniffMime(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]), "fake.pdf")).toBeNull();
  });
});
