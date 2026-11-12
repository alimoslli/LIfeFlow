import { describe, expect, it } from "vitest";
import { billingConfig, TESTING_LIMITS } from "@/server/billing";
import {
  budgetLines,
  companyLimits,
  monthOpensOn,
  personLimits,
  refusalMessage,
  refusalOf,
  secondsToNextDay,
  type AiSubject,
} from "@/server/services/ai-limits";

const NOW = new Date("2026-11-12T15:00:00Z"); // 10 AM in New York
const person = (over: Partial<AiSubject> = {}): AiSubject => ({
  userId: "11111111-1111-4111-8111-111111111111",
  tz: "America/New_York",
  accountKind: "standard",
  isAdmin: false,
  name: "Ray",
  ...over,
});
const STRIPE = billingConfig({ STRIPE_SECRET_KEY: "sk", STRIPE_WEBHOOK_SECRET: "wh", STRIPE_PRICE_ID: "price_1", APP_URL: "https://x.test" });
const keys = (l: { key: string }[]) => l.map((x) => x.key.replace(person().userId, "U"));

describe("per-person limits", () => {
  it("in testing: the owner's numbers (decisions 1 to 4)", () => {
    const l = personLimits(person(), null, {} as never);
    expect(l).toMatchObject({
      msgsPerDay: 30,
      msgsPerMonth: 300,
      microsPerMonth: 4_000_000,
      voiceCallsPerDay: 2,
      voiceCallsPerMonth: 10,
      voiceSecondsPerMonth: 1800,
      searchesPerMonth: 60,
      documentsPerMonth: 100,
      tidyRunsPerDay: 10,
    });
    expect(TESTING_LIMITS.webSearchesPerMonth).toBe(60);
  });

  it("admins and the demo account have no per-person limits", () => {
    expect(personLimits(person({ isAdmin: true }), null, {} as never)).toEqual({});
    expect(personLimits(person({ accountKind: "demo" }), null, {} as never)).toEqual({});
  });

  it("after launch, a Pro allowance is off until the owner picks a number", () => {
    expect(personLimits(person({ plan: "pro" }), STRIPE, {} as never)).toEqual({});
    expect(personLimits(person({ plan: "pro" }), STRIPE, { AI_PRO_MONTH_DOLLARS: 12 } as never)).toEqual({ microsPerMonth: 12_000_000 });
    expect(personLimits(person({ plan: "free" }), STRIPE, { AI_PRO_MONTH_DOLLARS: 12 } as never)).toEqual({});
  });
});

describe("company limits", () => {
  it("default to the owner's numbers and can be changed in settings", () => {
    expect(companyLimits({} as never)).toEqual({ monthMicros: 50_000_000, dayMicros: 10_000_000, monthCalls: null, dayCalls: null });
    expect(companyLimits({ AI_GLOBAL_MONTH_DOLLARS: 80, AI_GLOBAL_DAY_DOLLARS: 12, AI_GLOBAL_DAY_CALLS: 500 } as never)).toMatchObject({
      monthMicros: 80_000_000,
      dayMicros: 12_000_000,
      dayCalls: 500,
    });
  });
});

describe("what a piece of work sets aside", () => {
  const limits = personLimits(person(), null, {} as never);
  const co = companyLimits({} as never);

  it("a message counts a day and a month (calendar month in their time zone) only on its first step", () => {
    const first = budgetLines(person(), { feature: "chat", firstStep: true, estimateMicros: null }, NOW, limits, co);
    expect(keys(first)).toEqual(["u:U:2026-11-12:msgs", "u:U:2026-11:msgs"]);
    expect(budgetLines(person(), { feature: "chat", firstStep: false, estimateMicros: null }, NOW, limits, co)).toEqual([]);
  });

  it("the month is the user's own: just after midnight UTC on the 1st it is still October in New York", () => {
    const l = budgetLines(person(), { feature: "sms", firstStep: true, estimateMicros: null }, new Date("2026-12-01T03:00:00Z"), limits, co);
    expect(keys(l)).toEqual(["u:U:2026-11-30:msgs", "u:U:2026-11:msgs"]);
  });

  it("money is set aside only when the cost has an estimate (a configured price)", () => {
    const priced = budgetLines(person(), { feature: "chat", firstStep: false, estimateMicros: 90_000 }, NOW, limits, co);
    expect(priced).toEqual([
      { key: `u:${person().userId}:2026-11:micros`, kind: "micros", amount: 90_000, limit: 4_000_000 },
      { key: "g:2026-11:micros", kind: "micros", amount: 90_000, limit: 50_000_000 },
      { key: "g:2026-11-12:micros", kind: "micros", amount: 90_000, limit: 10_000_000 },
    ]);
  });

  it("voice sets aside a call and its minutes; search, documents and tidying their own counts", () => {
    expect(
      budgetLines(person(), { feature: "voice", seconds: 180 }, NOW, limits, co).map((l) => [l.key.replace(person().userId, "U"), l.amount, l.limit]),
    ).toEqual([
      ["u:U:2026-11-12:vcalls", 1, 2],
      ["u:U:2026-11:vcalls", 1, 10],
      ["u:U:2026-11:vsecs", 180, 1800],
    ]);
    expect(keys(budgetLines(person(), { feature: "web_search", estimateMicros: null }, NOW, limits, co))).toEqual(["u:U:2026-11:searches"]);
    expect(keys(budgetLines(person(), { feature: "document", estimateMicros: null }, NOW, limits, co))).toEqual(["u:U:2026-11:docs"]);
    expect(keys(budgetLines(person(), { feature: "tidy", estimateMicros: null }, NOW, limits, co))).toEqual(["u:U:2026-11-12:tidy"]);
  });

  it("an admin is counted on the company's counters but never stopped by them", () => {
    const admin = person({ isAdmin: true });
    const l = budgetLines(admin, { feature: "chat", firstStep: true, estimateMicros: 5_000 }, NOW, personLimits(admin, null, {} as never), co);
    expect(l.map((x) => [x.key, x.limit])).toEqual([
      ["g:2026-11:micros", null],
      ["g:2026-11-12:micros", null],
    ]);
  });

  it("company count ceilings apply only when configured", () => {
    const withCalls = companyLimits({ AI_GLOBAL_DAY_CALLS: 100 } as never);
    const l = budgetLines(person(), { feature: "tidy", estimateMicros: null }, NOW, limits, withCalls);
    expect(l.at(-1)).toEqual({ key: "g:2026-11-12:calls", kind: "count", amount: 1, limit: 100 });
  });
});

describe("what the person reads", () => {
  const lines = budgetLines(
    person(),
    { feature: "chat", firstStep: true, estimateMicros: null },
    NOW,
    personLimits(person(), null, {} as never),
    companyLimits({} as never),
  );
  const subject = person();

  it("the next 1st, as a date", () => {
    expect(monthOpensOn(subject, NOW)).toBe("December 1");
    expect(monthOpensOn(subject, new Date("2026-12-20T15:00:00Z"))).toBe("January 1");
  });

  it("a day's limit says when it opens (the next local midnight); a month's says the date", () => {
    expect(secondsToNextDay(subject, NOW)).toBe(14 * 3600);
    expect(refusalMessage(refusalOf(lines[0].key, lines), subject, NOW)).toBe(
      "You've used today's 30 messages. While LifeFlow is in testing, everyone gets 30 a day. More open up in about 14 hours.",
    );
    expect(refusalMessage(refusalOf(lines[1].key, lines), subject, NOW)).toBe(
      "You've used this month's 300 messages. While LifeFlow is in testing, everyone gets 300 a month. More open up on December 1.",
    );
  });

  it("the money, minutes, searches and documents say the month's allowance opens on the 1st", () => {
    const money = refusalOf(`u:${subject.userId}:2026-11:micros`, []);
    expect(refusalMessage(money, subject, NOW)).toBe(
      "You've reached this month's skyling limit while LifeFlow is in testing. It opens up again on December 1. Everything else in the app keeps working.",
    );
  });

  it("the company's ceiling says the skyling isn't available, with its name", () => {
    const r = refusalOf("g:2026-11:micros", []);
    expect(refusalMessage(r, subject, NOW)).toBe("Ray isn't available right now. Try again later.");
    expect(refusalMessage(r, { ...subject, name: "your skyling" }, NOW)).toBe("Your skyling isn't available right now. Try again later.");
  });

  it("never names a model, a setting or tokens", () => {
    for (const k of ["u:x:2026-11:micros", "u:x:2026-11:vsecs", "g:2026-11-12:micros", "u:x:2026-11:msgs"])
      expect(refusalMessage(refusalOf(k, []), subject, NOW)).not.toMatch(/token|model|gpt|openai|AI_|JARVIS/i);
  });
});
