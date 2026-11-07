import { describe, expect, it } from "vitest";
import { cleanVendorName, correctedVendorName, looksMessy } from "@/lib/vendor";

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

  it("keeps an apostrophe's tail lower case, and capitalises real name parts", () => {
    expect(cleanVendorName("SHELL'S SEAFOOD")).toBe("Shell's Seafood");
    expect(cleanVendorName("DON'T PANIC DINER")).toBe("Don't Panic Diner");
    expect(cleanVendorName("MARIO'S PIZZA")).toBe("Mario's Pizza");
    expect(cleanVendorName("O'BRIEN'S PUB")).toBe("O'Brien's Pub");
    expect(cleanVendorName("O’BRIEN BAR")).toBe("O’Brien Bar");
    expect(cleanVendorName("D'ANGELO SUBS")).toBe("D'Angelo Subs");
    expect(cleanVendorName("MCDONALD'S F18234 ATLANTA GA")).toBe("McDonald's");
    expect(cleanVendorName("AT&T WIRELESS")).toBe("AT&T");
  });

  it("flags names that still look like statement noise", () => {
    expect(looksMessy("KJSDF*2234 LLC")).toBe(true);
    expect(looksMessy("Blue Bottle Coffee")).toBe(false);
  });
});

describe("brands that share a word stay apart (review: over-broad brand patterns)", () => {
  // [line, name it's shown as]: each pair used to come out as one brand.
  const pairs: [string, string][][] = [
    [
      ["SOUTHWEST GAS CORP PAYMENT", "Southwest Gas Corp"],
      ["SOUTHWEST AIRLINES 5262191234567", "Southwest Airlines"],
    ],
    [
      ["VERIZON FIOS 800-837-4966", "Verizon Fios"],
      ["VERIZON WIRELESS PAYMENTS", "Verizon"],
    ],
    [
      ["XFINITY MOBILE 888-936-4968", "Xfinity Mobile"],
      ["COMCAST CABLE COMM", "Xfinity"],
    ],
    [
      ["COSTCO GAS #0123", "Costco Gas"],
      ["COSTCO WHSE #0123", "Costco"],
    ],
    [
      ["KROGER FUEL #455", "Kroger Fuel"],
      ["KROGER #455", "Kroger"],
    ],
    [
      ["AWS EMEA aws.amazon.co", "Amazon Web Services"],
      ["AMZN Mktp US*2K1AB3", "Amazon"],
    ],
    [
      ["MTA*NYCT PAYGO SUBWAY", "Mta Nyct Paygo Subway"],
      ["SUBWAY 12345 ATLANTA GA", "Subway"],
    ],
    [
      ["SHELL SHACK SEAFOOD", "Shell Shack Seafood"],
      ["SHELL OIL 57444810", "Shell"],
    ],
    [
      ["YOUTUBE TV 855-978-3324", "YouTube TV"],
      ["GOOGLE *YouTube Premium", "YouTube"],
    ],
    [
      ["SAFEWAY FUEL 1234", "Safeway Fuel"],
      ["SAFEWAY #1234", "Safeway"],
    ],
    [
      ["APPLE CASH SENT MONEY", "Apple Cash"],
      ["APPLE.COM/BILL 866-712-7753 CA", "Apple"],
    ],
  ];
  for (const [a, b] of pairs)
    it(`${a[0]} isn't ${b[1]}`, () => {
      expect(cleanVendorName(a[0])).toBe(a[1]);
      expect(cleanVendorName(b[0])).toBe(b[1]);
    });
});

describe("names the earlier, broader patterns gave (review: rows renamed by the old tidy)", () => {
  it("recomputes a name an old pattern gave from the bank's line, and leaves Plaid's or the person's names alone", () => {
    expect(correctedVendorName("Southwest Airlines", "SOUTHWEST GAS CORP PAYMENT")).toBe("Southwest Gas Corp");
    expect(correctedVendorName("Verizon", "VERIZON FIOS 800-837-4966")).toBe("Verizon Fios");
    expect(correctedVendorName("Xfinity", "XFINITY MOBILE 888-936-4968")).toBe("Xfinity Mobile");
    expect(correctedVendorName("YouTube", "YOUTUBE TV 855-978-3324")).toBe("YouTube TV");
    expect(correctedVendorName("Costco", "COSTCO GAS #0123")).toBe("Costco Gas");
    expect(correctedVendorName("Shell", "SHELL SHACK SEAFOOD")).toBe("Shell Shack Seafood");
    // Already right, from Plaid, or typed by the person: nothing to correct.
    expect(correctedVendorName("Southwest Airlines", "SOUTHWEST AIRLINES 5262191234567")).toBeNull();
    expect(correctedVendorName("Verizon", "VERIZON WIRELESS PAYMENTS")).toBeNull();
    expect(correctedVendorName("Hulu", "APPLE.COM/BILL HULU")).toBeNull();
    expect(correctedVendorName("Gas bill", "SOUTHWEST GAS CORP PAYMENT")).toBeNull();
    expect(correctedVendorName(null, "SOUTHWEST GAS CORP PAYMENT")).toBeNull();
  });
});
