import { describe, expect, it } from "vitest";
import { parseSearch, rowMatches, scoreRow } from "@/lib/txn-search";

const match = (search: string, description: string, merchantName: string | null = null) => rowMatches(parseSearch(search).terms, { description, merchantName });
const fuzzy = (search: string, description: string, merchantName: string | null = null) =>
  scoreRow(parseSearch(search).terms, { description, merchantName }, true).all;

describe("parseSearch", () => {
  it("drops filler words and treats payment apps as hints", () => {
    expect(parseSearch("last time I Zelled Omar Mousselli")).toEqual({ terms: ["omar", "mousselli"], apps: ["zelle"] });
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
