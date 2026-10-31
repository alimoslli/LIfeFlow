import { describe, expect, it } from "vitest";
import { detectRecurring } from "@/server/services/finance/recurring-detect";
import { truth, txns } from "../fixtures/student-bank";

/**
 * Measured accuracy of recurring-charge detection on a realistic bank feed
 * (tests/fixtures/student-bank.ts). Every real bill, subscription and paycheck
 * must be found, and everyday spending (coffee, groceries, rides) must not be.
 */
function score() {
  const found = detectRecurring(txns);
  const hits = truth.map((t) => ({ t, c: found.filter((c) => t.match.test(c.name)) }));
  const matched = new Set(hits.flatMap((h) => h.c));
  const falsePositives = found.filter((c) => !matched.has(c));
  const duplicates = hits.filter((h) => h.c.length > 1).map((h) => h.t.match.source);
  return {
    found,
    missed: hits.filter((h) => !h.c.length).map((h) => h.t.match.source),
    falsePositives: falsePositives.map((c) => `${c.name} (${c.frequency})`),
    duplicates,
    wrongKind: hits.filter((h) => h.c[0] && h.c[0].kind !== h.t.kind).map((h) => `${h.t.match.source}: ${h.c[0].kind}`),
    wrongAmount: hits
      .filter((h) => h.c[0] && h.t.latestCents && Math.abs(h.c[0].latestAmountCents) !== h.t.latestCents)
      .map((h) => `${h.t.match.source}: ${Math.abs(h.c[0].latestAmountCents)}`),
  };
}

describe("recurring-charge detection on a real-looking bank feed", () => {
  it("finds every bill, subscription and paycheck, and nothing else", () => {
    const s = score();
    console.log(
      JSON.stringify(
        { missed: s.missed, falsePositives: s.falsePositives, duplicates: s.duplicates, wrongKind: s.wrongKind, wrongAmount: s.wrongAmount },
        null,
        1,
      ),
    );
    expect(s.missed).toEqual([]);
    expect(s.falsePositives).toEqual([]);
    expect(s.duplicates).toEqual([]);
    expect(s.wrongKind).toEqual([]);
    expect(s.wrongAmount).toEqual([]);
  });
});
