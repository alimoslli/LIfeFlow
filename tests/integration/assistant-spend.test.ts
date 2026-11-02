import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { conversations, jarvisRuns } from "@/server/db/schema";
import { spendSinceMicros } from "@/server/jarvis/metrics";
import { makeUser } from "../helpers";

afterAll(closeDb);

describe("assistant spend for the monthly cap", () => {
  it("adds up only this person's priced turns in the window", async () => {
    const u = await makeUser();
    const other = await makeUser();
    const add = (who: typeof u, costMicros: number | null, daysAgo: number) =>
      who.run(async ({ tx, userId }) => {
        const [c] = await tx.insert(conversations).values({ userId, title: "t" }).returning();
        await tx.insert(jarvisRuns).values({
          userId,
          conversationId: c.id,
          provider: "openai",
          model: "test",
          promptVersion: "test",
          latencyMs: 1,
          steps: 1,
          outcome: "ok",
          costMicros,
          createdAt: new Date(Date.now() - daysAgo * 86_400_000),
        } as typeof jarvisRuns.$inferInsert);
      });
    await add(u, 1_500_000, 1);
    await add(u, 700_000, 10);
    await add(u, null, 2); // unpriced turn
    await add(u, 9_000_000, 40); // outside the 30-day window
    await add(other, 5_000_000, 1);
    const since = new Date(Date.now() - 30 * 86_400_000);
    expect(await u.run((s) => spendSinceMicros(s, since))).toBe(2_200_000);
  });
});
