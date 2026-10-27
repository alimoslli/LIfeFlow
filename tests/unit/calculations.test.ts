import { describe, expect, it } from "vitest";
import { localToInstant, monthEnd, todayIn, weekStart } from "@/lib/dates";
import { parseMoneyToCents } from "@/lib/money";
import { summarizeCashflow, type CashflowTxn } from "@/server/services/finance/cashflow";
import { detectRecurring, nextOccurrence } from "@/server/services/finance/recurring-detect";
import { inferKind, parseCsv, toCsv } from "@/server/services/finance/transactions";
import { estimateEarnings, shiftInstants, shiftPaidMinutes } from "@/server/services/work";
import { matchCourses } from "@/server/services/school";
import { sensitiveContentReason } from "@/server/services/memory";
import { encryptSecret, decryptSecret } from "@/server/crypto";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { expandOccurrences, findConflicts, freeSlots, type AgendaItem } from "@/server/services/calendar";

const TZ = "America/New_York";
const t = (amountCents: number, kind: CashflowTxn["kind"], extra: Partial<CashflowTxn> = {}): CashflowTxn => ({
  amountCents,
  kind,
  pending: false,
  excluded: false,
  categoryId: null,
  ...extra,
});

describe("cash flow", () => {
  it("excludes transfers and investments from income and spending", () => {
    const s = summarizeCashflow([
      t(200000, "income"),
      t(-5000, "expense"),
      t(-100000, "transfer"), // checking -> savings
      t(100000, "transfer"), // savings <- checking
      t(-25000, "investment"),
    ]);
    expect(s.incomeCents).toBe(200000);
    expect(s.netSpendingCents).toBe(5000);
    expect(s.transfersInCents).toBe(100000);
    expect(s.transfersOutCents).toBe(100000);
    expect(s.investmentContributionsCents).toBe(25000);
    expect(s.netCashflowCents).toBe(195000);
  });

  it("treats refunds and reimbursements as offsets, not income", () => {
    const s = summarizeCashflow([t(-8000, "expense"), t(3000, "refund"), t(2000, "reimbursement")]);
    expect(s.incomeCents).toBe(0);
    expect(s.grossSpendingCents).toBe(8000);
    expect(s.netSpendingCents).toBe(3000);
  });

  it("can exclude pending and always skips excluded rows", () => {
    const rows = [t(-1000, "expense", { pending: true }), t(-500, "expense"), t(-9999, "expense", { excluded: true })];
    expect(summarizeCashflow(rows).netSpendingCents).toBe(1500);
    expect(summarizeCashflow(rows, { includePending: false }).netSpendingCents).toBe(500);
    expect(summarizeCashflow(rows).pendingCount).toBe(1);
    expect(summarizeCashflow(rows).excludedCount).toBe(1);
  });

  it("infers transaction kinds from sign and category", () => {
    expect(inferKind(-500, "expense")).toBe("expense");
    expect(inferKind(500, "expense")).toBe("refund");
    expect(inferKind(500, "income")).toBe("income");
    expect(inferKind(-500, "transfer")).toBe("transfer");
    expect(inferKind(-500, null)).toBe("expense");
  });
});

describe("money & dates", () => {
  it("parses money", () => {
    expect(parseMoneyToCents("$1,234.5")).toBe(123450);
    expect(parseMoneyToCents("-12.34")).toBe(-1234);
    expect(parseMoneyToCents("abc")).toBeNull();
  });

  it("converts local due dates to instants across DST", () => {
    // 11:59 PM EST on 2026-11-02 (after DST ends) is 04:59 UTC next day
    expect(localToInstant("2026-11-02", null, TZ).toISOString()).toBe("2026-11-03T04:59:00.000Z");
    // 9:00 AM EDT in October is 13:00 UTC
    expect(localToInstant("2026-10-20", "09:00", TZ).toISOString()).toBe("2026-10-20T13:00:00.000Z");
  });

  it("computes today in the user's zone, not the server's", () => {
    const lateNightUtc = new Date("2026-10-27T02:30:00Z"); // still Oct 26 in New York
    expect(todayIn(TZ, lateNightUtc)).toBe("2026-10-26");
    expect(todayIn("UTC", lateNightUtc)).toBe("2026-10-27");
  });

  it("handles week and month boundaries", () => {
    expect(weekStart("2026-10-29")).toBe("2026-10-26"); // Thursday -> Monday
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(nextOccurrence("2026-01-31", "monthly")).toBe("2026-02-28");
  });
});

describe("recurring detection", () => {
  it("finds a monthly subscription with stable amounts and ignores noise", () => {
    const txns = [
      ...["2026-05-03", "2026-06-03", "2026-07-03", "2026-08-04", "2026-09-03"].map((date) => ({
        date,
        amountCents: -1599,
        merchantName: "Netflix",
        description: "NETFLIX.COM 8843",
        kind: "expense",
      })),
      { date: "2026-06-10", amountCents: -4500, merchantName: "Target", description: "TARGET", kind: "expense" },
      { date: "2026-08-22", amountCents: -1200, merchantName: "Target", description: "TARGET", kind: "expense" },
    ];
    const found = detectRecurring(txns);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ frequency: "monthly", occurrences: 5, averageAmountCents: -1599 });
  });
});

describe("work earnings", () => {
  const shift = (start: string, end: string, extra: object = {}) => ({
    startsAt: new Date(start),
    endsAt: new Date(end),
    breakMinutes: 30,
    breakPaid: false,
    recordedStart: null,
    recordedEnd: null,
    status: "scheduled" as const,
    ...extra,
  });

  it("deducts unpaid breaks and prefers recorded punches", () => {
    expect(shiftPaidMinutes(shift("2026-10-20T13:00:00Z", "2026-10-20T21:00:00Z")).minutes).toBe(450);
    const recorded = shiftPaidMinutes(
      shift("2026-10-20T13:00:00Z", "2026-10-20T21:00:00Z", {
        recordedStart: new Date("2026-10-20T13:10:00Z"),
        recordedEnd: new Date("2026-10-20T21:40:00Z"),
      }),
    );
    expect(recorded).toEqual({ minutes: 480, basis: "recorded" });
  });

  it("applies weekly overtime", () => {
    // 6 x 8h shifts (7.5h paid) in one week = 45h -> 5h overtime
    const shifts = [19, 20, 21, 22, 23, 24].map((d) => shift(`2026-10-${d}T13:00:00Z`, `2026-10-${d}T21:00:00Z`));
    const e = estimateEarnings(shifts, { payType: "hourly", hourlyRateCents: 2000, overtimeThresholdHours: 40, overtimeMultiplier: 1.5 }, TZ);
    expect(e.paidHours).toBe(45);
    expect(e.overtimeHours).toBe(5);
    expect(e.estimatedGrossCents).toBe(40 * 2000 + 5 * 3000);
    expect(e.basis).toBe("scheduled");
  });

  it("rolls overnight shifts into the next day", () => {
    const { startsAt, endsAt } = shiftInstants("2026-10-20", "22:00", "06:00", TZ);
    expect((endsAt.getTime() - startsAt.getTime()) / 3600_000).toBe(8);
  });
});

describe("course matching", () => {
  const list = [
    { id: "1", name: "Introduction to Biology", code: "BIO 101" },
    { id: "2", name: "Calculus II", code: "MATH 152" },
    { id: "3", name: "Biochemistry", code: "BIO 340" },
  ];
  it("matches by code regardless of spacing", () => {
    expect(matchCourses("bio101", list)[0].course.id).toBe("1");
    expect(matchCourses("MATH-152", list)[0].course.id).toBe("2");
  });
  it("matches by name fragments", () => {
    expect(matchCourses("calculus", list)[0].course.id).toBe("2");
  });
  it("returns nothing for unrelated text", () => {
    expect(matchCourses("Art History", list)).toHaveLength(0);
  });
});

describe("calendar", () => {
  it("expands weekly recurrences with an end date", () => {
    const occ = expandOccurrences(
      {
        startsAt: localToInstant("2026-10-05", "10:00", TZ),
        endsAt: localToInstant("2026-10-05", "11:15", TZ),
        allDay: false,
        recurrence: { freq: "weekly", byDay: [1, 3], until: "2026-10-21" },
      },
      "2026-10-12",
      "2026-10-31",
      TZ,
    );
    expect(occ.map((o) => o.startsAt.toISOString())).toEqual([
      "2026-10-12T14:00:00.000Z",
      "2026-10-14T14:00:00.000Z",
      "2026-10-19T14:00:00.000Z",
      "2026-10-21T14:00:00.000Z",
    ]);
  });

  const item = (title: string, start: string, end: string | null, blocksTime = true): AgendaItem => ({
    key: title,
    origin: "event",
    id: title,
    title,
    startsAt: localToInstant("2026-10-27", start, TZ),
    endsAt: end ? localToInstant("2026-10-27", end, TZ) : null,
    allDay: false,
    kind: "personal",
    color: null,
    subtitle: null,
    href: "/",
    blocksTime,
  });

  it("detects overlaps but ignores deadlines", () => {
    const c = findConflicts([item("Class", "10:00", "11:15"), item("Shift", "11:00", "15:00"), item("Due", "10:30", null, false)]);
    expect(c).toHaveLength(1);
    expect([c[0].a.title, c[0].b.title]).toEqual(["Class", "Shift"]);
  });

  it("finds free slots", () => {
    const slots = freeSlots([item("Class", "10:00", "11:00"), item("Shift", "13:00", "21:00")], "2026-10-27", TZ, "08:00", "22:00", 60);
    expect(slots.map((s) => s.minutes)).toEqual([120, 120, 60]);
  });
});

describe("security utilities", () => {
  it("blocks secrets from memory", () => {
    expect(sensitiveContentReason("my api key is sk-abcdefghijklmnopqrstuvwx")).toMatch(/API key/);
    expect(sensitiveContentReason("password: hunter22")).toMatch(/password/);
    expect(sensitiveContentReason("card 4111 1111 1111 1111")).toMatch(/card/);
    expect(sensitiveContentReason("SSN 123-45-6789")).toMatch(/Social Security/);
    expect(sensitiveContentReason("I prefer studying in the morning")).toBeNull();
    expect(sensitiveContentReason("I work at Target 20 hours a week")).toBeNull();
  });

  it("round-trips encrypted credentials and detects tampering", () => {
    const key = Buffer.alloc(32, 1).toString("base64");
    const c = encryptSecret("access-sandbox-123", key);
    expect(c).not.toContain("access-sandbox");
    expect(decryptSecret(c, key)).toBe("access-sandbox-123");
    const parts = c.split(".");
    parts[3] = Buffer.from("tampered").toString("base64");
    expect(() => decryptSecret(parts.join("."), key)).toThrow();
  });

  it("hashes and verifies passwords", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });

  it("parses quoted CSV and neutralises formula injection on export", () => {
    expect(parseCsv('date,description,amount\n2026-10-01,"Coffee, large",-4.50\r\n')).toEqual([
      ["date", "description", "amount"],
      ["2026-10-01", "Coffee, large", "-4.50"],
    ]);
    expect(toCsv(["a"], [["=HYPERLINK(1)"], [-5]])).toBe("a\n'=HYPERLINK(1)\n-5");
  });
});
