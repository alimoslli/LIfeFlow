import { describe, expect, it } from "vitest";
import { LOCKED_MONEY_PUSH } from "@/lib/jarvis-voice";
import type { JarvisMessage } from "@/server/services/proactive/engine";
import { toCard } from "@/server/services/proactive/present";

const msg = (over: Partial<JarvisMessage>): JarvisMessage =>
  ({
    id: "m1",
    kind: "morning_brief",
    topic: "general",
    title: "Your morning brief",
    body: "Good morning! 3 things on today's list, $842 available now. The one thing: Essay draft.",
    status: "new",
    rating: null,
    action: null,
    result: null,
    urgent: false,
    snoozedUntil: null,
    createdAt: new Date("2026-11-10T08:00:00Z"),
    facts: {
      count: 3,
      money: "$842 available now",
      oneThing: "Essay draft",
      sections: [
        { heading: "Due", lines: ["Essay draft (ENG 102) due today"] },
        { heading: "Money", lines: ["$842 available now"] },
        { heading: "The one thing", lines: ["Essay draft"] },
      ],
    },
    ...over,
  }) as unknown as JarvisMessage;

describe("cards while Money is locked (the lock covers amounts in every card, not just money cards)", () => {
  it("the morning brief loses its money line and its balance; unlocked it keeps both", () => {
    const locked = toCard(msg({}), "America/New_York", { moneyLocked: true });
    expect(locked.body).toBe("3 things on today's list. The one thing: Essay draft.");
    expect(locked.sections?.map((s) => s.heading)).toEqual(["Due", "The one thing"]);
    expect(JSON.stringify(locked)).not.toMatch(/\$\d/);
    const open = toCard(msg({}), "America/New_York");
    expect(open.body).toContain("$842");
    expect(open.sections?.map((s) => s.heading)).toEqual(["Due", "Money", "The one thing"]);
  });

  it("a title or body with an amount and no safe wording falls back to the heads-up", () => {
    const c = toCard(msg({ kind: "not_a_kind", title: "Saved $40", body: "You kept $40 this week.", facts: {} }), "UTC", { moneyLocked: true });
    expect(c.title).toBe(LOCKED_MONEY_PUSH.title);
    expect(c.body).toBe(LOCKED_MONEY_PUSH.body);
  });

  it("a card with no money is untouched", () => {
    const m = msg({ kind: "evening_wrap", title: "Today's wrap-up", body: "You finished 2 to-dos today.", facts: { done: 2, left: 0 } });
    expect(toCard(m, "UTC", { moneyLocked: true })).toEqual(toCard(m, "UTC"));
  });
});
