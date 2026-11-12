import { describe, expect, it } from "vitest";
import { countedNames } from "@/lib/counted-names";

const row = (description: string, amountCents: number, merchantName: string | null = null, kind?: string) => ({ description, merchantName, amountCents, kind });

describe("countedNames", () => {
  it("lists each name once with its payment count and integer cents, biggest first", () => {
    const out = countedNames([
      row("ZELLE TO OMAR HADDAD 1", -10000, "Omar Haddad"),
      row("ZELLE TO OMAR HADDAD 2", -5000, "Omar Haddad"),
      row("OMAR H ZELLE", -9000),
      row("ZELLE FROM OMAR HADDAD", 2500, "Omar Haddad"),
    ]);
    expect(out.names).toEqual([
      { name: "Omar Haddad", count: 3, paidCents: 15000, receivedCents: 2500 },
      { name: "OMAR H ZELLE", count: 1, paidCents: 9000, receivedCents: 0 },
    ]);
  });

  it("never merges two different names, even when they look alike", () => {
    const out = countedNames([row("ZELLE TO OMAR HADDAD", -1000), row("ZELLE TO OMAR HADID", -2000)]);
    expect(out.names.map((n) => n.name).sort()).toEqual(["ZELLE TO OMAR HADDAD", "ZELLE TO OMAR HADID"]);
  });

  it("is empty for no rows", () => {
    expect(countedNames([])).toEqual({ names: [], leftOut: { count: 0, cents: 0 } });
  });

  it("counts each kind where the totals do: refunds come off paid, income is received, transfers are left out", () => {
    const out = countedNames([
      row("ZELLE TO OMAR HADDAD", -10000, null, "expense"),
      row("ZELLE FROM OMAR HADDAD", 2500, null, "income"),
      row("ZELLE TO OMAR HADDAD", 1500, null, "refund"),
      row("ZELLE TO OMAR HADDAD", -7000, null, "transfer"),
    ]);
    expect(out.names).toEqual([
      { name: "ZELLE TO OMAR HADDAD", count: 2, paidCents: 8500, receivedCents: 0 },
      { name: "ZELLE FROM OMAR HADDAD", count: 1, paidCents: 0, receivedCents: 2500 },
    ]);
    expect(out.names.reduce((n, x) => n + x.paidCents, 0)).toBe(8500);
    expect(out.names.reduce((n, x) => n + x.receivedCents, 0)).toBe(2500);
    expect(out.leftOut).toEqual({ count: 1, cents: 7000 });
  });

  it("cuts a very long name", () => {
    expect(countedNames([row("X".repeat(300), -100)]).names[0].name).toHaveLength(80);
  });
});
