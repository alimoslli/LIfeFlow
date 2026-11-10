import { describe, expect, it } from "vitest";
import { centsToDollarsDeep } from "@/server/jarvis/tools/finance";

describe("money results for the assistant", () => {
  const at = new Date("2026-11-10T08:53:00.000Z");

  it("gives balance times in the person's own clock, not UTC", () => {
    // 08:53 UTC is 3:53 AM in New York and 4:53 PM in Singapore
    expect(centsToDollarsDeep({ balances: { asOf: at, totalCents: 84217 } }, "America/New_York")).toEqual({
      balances: { asOf: "Tue Nov 10, 3:53 AM", total: 842.17 },
    });
    expect(centsToDollarsDeep([{ asOf: at }], "Asia/Singapore")).toEqual([{ asOf: "Tue Nov 10, 4:53 PM" }]);
  });

  it("keeps the exact timestamp when no time zone is given", () => {
    expect(centsToDollarsDeep({ asOf: at, cents: 500 })).toEqual({ asOf: "2026-11-10T08:53:00.000Z", amount: 5 });
  });
});
