import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The live search is stood in for (no paid call); what's counted is how often the detector asks for one.
const searches = vi.hoisted(() => ({ n: 0, options: [] as unknown[] }));
vi.mock("@/server/integrations/web-search", async (orig) => ({
  ...(await orig<typeof import("@/server/integrations/web-search")>()),
  webSearchClient: () => ({ client: {}, model: "test" }),
  searchWeb: async () => {
    searches.n++;
    return { answer: JSON.stringify({ options: searches.options }), sources: [], searchedAt: new Date().toISOString() };
  },
}));

import { closeDb } from "@/server/db/client";
import { createRecurring } from "@/server/services/finance/planning";
import { DETECTORS, RUNS } from "@/server/services/proactive/detectors";
import { makeUser, TZ } from "../helpers";

afterAll(closeDb);
beforeEach(() => {
  searches.n = 0;
  searches.options = [];
});

// "Early each month: checks the biggest comparable bill" is one paid web search a month. A search that found nothing cheaper
// left no trace, so the same bill was searched again every morning through the 7th.
describe("the monthly cheaper-bill check", () => {
  const ctx = (scope: Parameters<(typeof DETECTORS)["savingsCheck"]>[0]["scope"], today: string) =>
    ({ scope, tz: TZ, today, now: new Date(`${today}T14:00:00Z`), prefs: undefined }) as unknown as Parameters<(typeof DETECTORS)["savingsCheck"]>[0];

  it("searches once a month when nothing cheaper is found, and again the next month", async () => {
    const { run } = await makeUser("Monthly Search");
    await run((s) => createRecurring(s, { name: "Verizon Wireless", amountCents: -6500, frequency: "monthly", nextDueDate: "2026-11-20", kind: "bill" }));
    for (const day of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-07"]) expect(await run((s) => DETECTORS.savingsCheck(ctx(s, day)))).toEqual([]);
    expect(searches.n).toBe(1);
    // after the 7th it doesn't look at all
    await run((s) => DETECTORS.savingsCheck(ctx(s, "2026-11-08")));
    expect(searches.n).toBe(1);
    await run((s) => DETECTORS.savingsCheck(ctx(s, "2026-12-01")));
    expect(searches.n).toBe(2);
  });

  it("is not part of any scheduled run while no page shows what it finds (owner, 2026-11-15)", () => {
    expect(Object.values(RUNS).flat()).not.toContain("savingsCheck");
  });

  it("searches nothing for an account with no comparable bill", async () => {
    const { run } = await makeUser("No Bills");
    await run((s) => createRecurring(s, { name: "Rent", amountCents: -90_000, frequency: "monthly", nextDueDate: "2026-11-20", kind: "bill" }));
    expect(await run((s) => DETECTORS.savingsCheck(ctx(s, "2026-11-02")))).toEqual([]);
    expect(searches.n).toBe(0);
  });
});
