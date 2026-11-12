import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { integrations } from "@/server/db/schema";
import { finishOnboarding, saveWelcomeProgress } from "@/server/services/onboarding";
import { keptSchema, proposalFrom } from "@/server/services/schedule-photo";
import { setUpSchedule } from "@/server/services/schedule-setup";
import { FIRST_CONNECTION_NEEDED, firstConnection, requireFirstConnection } from "@/server/services/setup-first";
import { TZ, makeUser } from "../helpers";

afterAll(closeDb);

// Setup in the app (owner, 2026-11-12): setup can't finish until one connection has really put something on the sky.
describe("the first connection", () => {
  it("is nothing on a new account, and setup can't be told it is", async () => {
    const { run } = await makeUser();
    expect(await run((s) => firstConnection(s))).toBeNull();
    await expect(run((s) => requireFirstConnection(s))).rejects.toThrow(FIRST_CONNECTION_NEEDED);
  });

  it("counts a connected Canvas, but not one that failed or was disconnected", async () => {
    const { user, run } = await makeUser();
    const [row] = await run((s) =>
      s.tx.insert(integrations).values({ userId: user.id, provider: "canvas", status: "error", displayName: "x" }).returning({ id: integrations.id }),
    );
    expect(await run((s) => firstConnection(s))).toBeNull();
    await run((s) => s.tx.update(integrations).set({ status: "disconnected" }).where(eq(integrations.id, row.id)));
    expect(await run((s) => firstConnection(s))).toBeNull();
    await run((s) => s.tx.update(integrations).set({ status: "connected" }).where(eq(integrations.id, row.id)));
    expect(await run((s) => requireFirstConnection(s))).toBe("canvas");
  });

  it("counts classes saved from a picture (through setUpSchedule), and a work schedule's shifts", async () => {
    const a = await makeUser();
    await a.run((s) => setUpSchedule(s, TZ, { classes: [{ name: "BIO 110", days: [1, 3], startTime: "10:00", endTime: "10:50" }] }));
    expect(await a.run((s) => firstConnection(s))).toBe("classes");
    const b = await makeUser();
    await b.run((s) => setUpSchedule(s, TZ, { jobs: [{ name: "Campus Coffee", shifts: [{ date: "2030-01-07", startTime: "16:00", endTime: "21:00" }] }] }));
    expect(await b.run((s) => firstConnection(s))).toBe("shifts");
  });

  it("keeps the birthday rule: a connection alone doesn't finish setup", async () => {
    const { run } = await makeUser();
    await run((s) => setUpSchedule(s, TZ, { classes: [{ name: "ENG 101", days: [2], startTime: "13:00", endTime: "14:15" }] }));
    await expect(run((s) => finishOnboarding(s, {}, TZ))).rejects.toThrow();
    await run((s) => saveWelcomeProgress(s, TZ, { birthDate: "2000-01-15" }));
    await run((s) => finishOnboarding(s, {}, TZ));
  });
});

describe("reading a picture of a schedule", () => {
  it("keeps only real days and times, and drops what it can't place", () => {
    const p = proposalFrom({
      classes: [
        { name: " BIO 110 ", days: [1, 3, 3, 9], start_time: "10:00", end_time: "10:50", location: "Room 210" },
        { name: "No times", days: [2], start_time: "soon", end_time: "later", location: null },
        { name: "No days", days: [], start_time: "10:00", end_time: "11:00", location: null },
      ],
      jobs: [
        {
          name: "Campus Coffee",
          weekly: [{ days: [1], start_time: "16:00", end_time: "21:00" }],
          shifts: [
            { date: "2030-01-07", start_time: "16:00", end_time: "21:00" },
            { date: "next tuesday", start_time: "16:00", end_time: "21:00" },
          ],
        },
        { name: "Empty", weekly: [], shifts: [] },
      ],
    });
    expect(p.classes).toEqual([{ name: "BIO 110", days: [1, 3], startTime: "10:00", endTime: "10:50", location: "Room 210" }]);
    expect(p.jobs).toHaveLength(1);
    expect(p.jobs[0].shifts).toEqual([{ date: "2030-01-07", startTime: "16:00", endTime: "21:00" }]);
  });

  it("gives nothing for anything that isn't a schedule, and re-checks what the person kept", () => {
    expect(proposalFrom(null)).toEqual({ classes: [], jobs: [] });
    expect(proposalFrom({ classes: "x", jobs: 3 })).toEqual({ classes: [], jobs: [] });
    expect(() => keptSchema.parse({ classes: [{ name: "x", days: [8], startTime: "10:00", endTime: "11:00" }], jobs: [] })).toThrow();
  });
});
