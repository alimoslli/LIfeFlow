import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { isSealed } from "@/server/crypto";
import { createMemory, listActiveMemories } from "@/server/services/memory";
import { makeUser } from "../helpers";

afterAll(closeDb);

describe("memory encryption at rest", () => {
  it("stores memories encrypted and reads them back as text; old plaintext rows still read", async () => {
    const { run } = await makeUser();
    await run((s) => createMemory(s, { content: "I study best in the morning.", category: "preference" }, "user"));
    const raw = await run((s) => s.tx.execute(sql`select content from memories`));
    const stored = String((raw.rows[0] as { content: string }).content);
    expect(isSealed(stored)).toBe(true);
    expect(stored).not.toContain("morning");
    // A row written before encryption (plain text) still works.
    await run((s) =>
      s.tx.execute(
        sql`insert into memories (user_id, content, category, source, basis, status) values (${s.userId}, 'Works Tuesdays.', 'routine', 'user', 'stated', 'active')`,
      ),
    );
    expect((await run((s) => listActiveMemories(s))).map((m) => m.content).sort()).toEqual(["I study best in the morning.", "Works Tuesdays."]);
  });
});

describe("weekly what-I-learned summary", () => {
  it("on Sunday evening lists the week's new memories and ratings", async () => {
    const { runProactive } = await import("@/server/services/proactive/engine");
    const { todayIn, addDaysStr } = await import("@/lib/dates");
    const { TZ } = await import("../helpers");
    const { run } = await makeUser();
    await run((s) => createMemory(s, { content: "Saving for Paris in May.", category: "goal" }, "user"));
    const today = todayIn(TZ);
    const daysToSunday = (7 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7;
    const sunday = new Date(`${addDaysStr(today, daysToSunday)}T23:30:00Z`);
    const out = await run((s) => runProactive({ scope: s, tz: TZ, prefs: {}, trigger: "evening", now: sunday }));
    const m = out.find((x) => x.kind === "weekly_learned")!;
    expect(m.body).toContain("I learned 1 new thing about you this week");
    expect(JSON.stringify(m.facts.sections)).toContain("Saving for Paris in May.");
    expect(m.action).toMatchObject({ type: "open", href: "/settings/memory" });
  });
});
