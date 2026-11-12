import { describe, expect, it } from "vitest";
import { countedNames } from "@/lib/counted-names";

const row = (description: string, amountCents: number, merchantName: string | null = null) => ({ description, merchantName, amountCents });

describe("countedNames", () => {
  it("lists each name once with its payment count and integer cents, biggest first", () => {
    const out = countedNames([
      row("ZELLE TO OMAR HADDAD 1", -10000, "Omar Haddad"),
      row("ZELLE TO OMAR HADDAD 2", -5000, "Omar Haddad"),
      row("OMAR H ZELLE", -9000),
      row("ZELLE FROM OMAR HADDAD", 2500, "Omar Haddad"),
    ]);
    expect(out).toEqual([
      { name: "Omar Haddad", count: 3, paidCents: 15000, receivedCents: 2500 },
      { name: "OMAR H ZELLE", count: 1, paidCents: 9000, receivedCents: 0 },
    ]);
  });

  it("never merges two different names, even when they look alike", () => {
    const out = countedNames([row("ZELLE TO OMAR HADDAD", -1000), row("ZELLE TO OMAR HADID", -2000)]);
    expect(out.map((n) => n.name).sort()).toEqual(["ZELLE TO OMAR HADDAD", "ZELLE TO OMAR HADID"]);
  });

  it("is empty for no rows", () => {
    expect(countedNames([])).toEqual([]);
  });
});
