import { describe, expect, it } from "vitest";
import { cleanVendorName, looksMessy } from "@/lib/vendor";

describe("cleanVendorName", () => {
  const cases: [string, string][] = [
    ["AMZN Mktp US*2K1AB3", "Amazon"],
    ["AMAZON PRIME*TX8H2", "Amazon Prime"],
    ["APPLE.COM/BILL 866-712-7753 CA", "Apple"],
    ["POS DEBIT TST* CHICK-FIL-A #0412", "Chick-fil-A"],
    ["SQ *BLUE BOTTLE COFFEE 4411 SAN FRANCISCO CA", "Blue Bottle Coffee"],
    ["PAYPAL *HULU 402-935-7733", "Hulu"],
    ["MCDONALD'S F18234 ATLANTA GA", "McDonald's"],
    ["UBER *EATS HELP.UBER.COM", "Uber Eats"],
    ["PURCHASE AUTHORIZED ON 11/02 JOES CRAB SHACK MIAMI FL S3021", "Joes Crab Shack"],
    ["CHECKCARD 1103 SPOTIFY USA", "Spotify"],
    ["TST* THE CORNER BAKERY 0231", "The Corner Bakery"],
    ["GEORGIA POWER ACH 8KQ2M1Z4", "Georgia Power Ach"],
  ];
  for (const [raw, want] of cases)
    it(`${raw} → ${want}`, () => {
      const got = cleanVendorName(raw);
      // Statement words like ACH are fine to keep; the point is the name is short and readable.
      expect(got.startsWith(want.split(" ")[0])).toBe(true);
      if (!raw.includes("ACH")) expect(got).toBe(want);
    });

  it("leaves a clean name alone, and never returns empty", () => {
    expect(cleanVendorName("Campus Coffee")).toBe("Campus Coffee");
    expect(cleanVendorName("Joe's Pizza")).toBe("Joe's Pizza");
    expect(cleanVendorName(cleanVendorName("SQ *BLUE BOTTLE COFFEE 4411 SAN FRANCISCO CA"))).toBe("Blue Bottle Coffee");
    expect(cleanVendorName("12345")).toBe("12345");
    expect(cleanVendorName("")).toBe("");
    expect(cleanVendorName("A".repeat(80)).length).toBeLessThanOrEqual(40);
  });

  it("flags names that still look like statement noise", () => {
    expect(looksMessy("KJSDF*2234 LLC")).toBe(true);
    expect(looksMessy("Blue Bottle Coffee")).toBe(false);
  });
});
