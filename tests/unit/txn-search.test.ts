import { describe, expect, it } from "vitest";
import { ACCENT_FROM, ACCENT_TO, parseSearch, rowMatches, scoreRow, words } from "@/lib/txn-search";

const match = (search: string, description: string, merchantName: string | null = null) => rowMatches(parseSearch(search).terms, { description, merchantName });
const fuzzy = (search: string, description: string, merchantName: string | null = null) =>
  scoreRow(parseSearch(search).terms, { description, merchantName }, true).all;

describe("parseSearch", () => {
  it("drops filler words and treats payment apps as hints", () => {
    expect(parseSearch("last time I Zelled Omar Mousselli")).toEqual({ terms: ["omar", "mousselli"], apps: ["zelle"], phrase: false });
    expect(parseSearch("payment sent to my Omar").terms).toEqual(["omar"]);
    expect(parseSearch("Cash App Dana").apps).toEqual(["cashapp"]);
  });
  it("still searches when only app or filler words are given", () => {
    expect(parseSearch("Zelle").terms).toEqual(["zelle"]);
    expect(parseSearch("the payment").terms.length).toBeGreaterThan(0);
  });
});

describe("matching real bank line shapes", () => {
  const search = "Omar Mousselli";
  it.each([
    ["ZELLE TO MOUSSELLI OMAR 12345", null],
    ["Zelle payment to OMAR M Conf# x7k2", null],
    ["ZELLE TRANSFER CONF 91827 OMAR MOUSSEL", null],
    ["P2P PAYMENT 5521 OMAR MOUSSELLI", null],
    ["ZELLE 5521", "Zelle to Omar Mousselli"],
    ["Online Transfer to MOUSSELLI,OMAR ref 3321", null],
  ])("finds %s", (description, merchant) => expect(match(search, description, merchant)).toBe(true));

  it("does not need the payment app word to appear", () => {
    expect(match("Zelle Omar Mousselli", "VENMO PAYMENT OMAR MOUSSELLI")).toBe(true);
  });

  it("rejects look-alikes and other people", () => {
    expect(match("Omar", "OMARKET 4412 ATLANTA GA")).toBe(false);
    expect(match("Omar", "ZELLE TO OMAR SMITH")).toBe(true);
    expect(match(search, "ZELLE TO OMAR SMITH 4412")).toBe(false);
    expect(match(search, "ZELLE TO OMAR SMITH M 4412")).toBe(false); // an initial only counts right next to the name
    expect(match(search, "ZELLE TO JOHN MOUSSELLI")).toBe(false);
    expect(match(search, "OMARKET MOUSSELLI")).toBe(false);
    expect(match("Sam", "SAMSUNG PAY")).toBe(false);
  });

  it("matches a truncated name only from 4 letters", () => {
    expect(match("Mousselli", "ZELLE MOUSS 1")).toBe(true);
    expect(match("Mousselli", "ZELLE MOU 1")).toBe(false);
  });

  it("a short truncated bank word never matches a longer different name", () => {
    expect(match("Johnson", "ZELLE TO JOHN SMITH")).toBe(false);
    expect(match("Johnson", "ZELLE TO JOHNS")).toBe(true);
  });

  it("is case and spacing blind, and works with first or last name alone", () => {
    expect(match("  omar    MOUSSELLI ", "zelle to Omar   Mousselli")).toBe(true);
    expect(match("mousselli", "ZELLE TO MOUSSELLI OMAR")).toBe(true);
    expect(match("Venmo Dana", "VENMO PAYMENT 99 DANA LEE")).toBe(true);
  });

  it("matches words in any order and a trailing s", () => {
    expect(match("starbuck", "STARBUCKS #1234")).toBe(true);
  });
});

describe("fuzzy pass for misspelled names", () => {
  it("finds spellings that are close", () => {
    expect(fuzzy("Omar Mousselli", "ZELLE TO O MOUSSELI 4412")).toBe(true);
    expect(fuzzy("Omar Mousselli", "ZELLE TO OMAR MOUSELLI")).toBe(true);
  });
  it("still rejects different people", () => {
    expect(fuzzy("Omar Mousselli", "ZELLE TO JOHN SMITH")).toBe(false);
    expect(fuzzy("Omar Mousselli", "ZELLE TO OSCAR PETERSON")).toBe(false);
    expect(fuzzy("Sam Lee", "ZELLE TO PAM LEE")).toBe(false); // short names get no typos
    expect(fuzzy("Omar Mousselli", "ZELLE TO AMAR MOUSSELLI")).toBe(false);
    expect(fuzzy("Omar Mousselli", "ZELLE TO OMAR MOSLI")).toBe(false);
  });
});

const sure = (search: string, description: string) => scoreRow(parseSearch(search).terms, { description }, false);

describe("search that leaves no usable word never drops the filter (H1)", () => {
  it.each(["Омар", "محمد", "Zelle 李明", "Zelle J", "J"])("%s falls back to the raw phrase", (q) => {
    expect(parseSearch(q).phrase).toBe(true);
  });
  it("app and filler words alone still search", () => {
    expect(parseSearch("Zelle")).toMatchObject({ phrase: false, terms: ["zelle"] });
    expect(parseSearch("the payment").phrase).toBe(false);
    expect(parseSearch("Zelle Omar").phrase).toBe(false);
  });
});

describe("sibling names are not exact (H2, M1)", () => {
  it.each([
    ["Samir Haddad", "ZELLE TO SAMIRA HADDAD"],
    ["Daniel Lee", "ZELLE TO DANIELLE LEE"],
    ["Julia Chen", "ZELLE TO JULIAN CHEN"],
    ["Mike Johns", "ZELLE TO MIKE JOHNSON"],
  ])("%s does not match %s as exact", (q, line) => expect(rowMatches(parseSearch(q).terms, { description: line })).toBe(false));

  it("a shortened name or bare initial matches but is not sure", () => {
    expect(sure("Samira Haddad", "ZELLE TO SAMIR HADDAD")).toMatchObject({ all: true, sure: false });
    expect(sure("Christopher Lee", "ZELLE TO CHRIS LEE")).toMatchObject({ all: true, sure: false });
    expect(sure("Omar Mousselli", "ZELLE TO OMAR MOUSSEL")).toMatchObject({ all: true, sure: false });
    expect(sure("John Mousselli", "ZELLE TO JOHN M 4412")).toMatchObject({ all: true, sure: false });
    expect(sure("Omar Mousselli", "ZELLE TO MOUSSELLI OMAR 1")).toMatchObject({ all: true, sure: true });
    expect(sure("starbuck", "STARBUCKS 1")).toMatchObject({ all: true, sure: true });
  });
  it("apostrophes join the name instead of splitting it", () => {
    expect(words("ZELLE TO OMAR O'BRIEN")).toContain("obrien");
    expect(rowMatches(parseSearch("Omar Ozturk").terms, { description: "ZELLE TO OMAR O'BRIEN" })).toBe(false);
    expect(rowMatches(parseSearch("Omar O'Brien").terms, { description: "ZELLE TO OMAR OBRIEN" })).toBe(true);
  });
});

describe("Cash App and folding (M2, L2)", () => {
  it("a bare Cash App search matches 'CASH APP*DANA'", () => {
    expect(rowMatches(parseSearch("Cash App").terms, { description: "CASH APP*DANA LEE*" })).toBe(true);
  });
  it("folds letters NFKD leaves alone", () => {
    expect(words("Łukasz Søren Đorđe")).toEqual(["lukasz", "soren", "dorde"]);
    expect(ACCENT_FROM.length).toBe(ACCENT_TO.length);
  });
});
