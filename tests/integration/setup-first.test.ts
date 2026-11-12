import { afterAll, describe, expect, it } from "vitest";
import { BIRTHDAY_NEEDED } from "@/lib/birthday";
import { eq } from "drizzle-orm";
import { closeDb } from "@/server/db/client";
import { calendarEvents, courses, financialAccounts, integrations } from "@/server/db/schema";
import { createManualAccount } from "@/server/services/finance/accounts";
import { finishOnboarding, saveWelcomeProgress } from "@/server/services/onboarding";
import { createEvent } from "@/server/services/calendar";
import { keptSchema, proposalFrom } from "@/server/services/schedule-photo";
import { setUpSchedule } from "@/server/services/schedule-setup";
import { FIRST_CONNECTION_NEEDED, finishSetup, firstConnection, requireFirstConnection } from "@/server/services/setup-first";
import { TZ, makeUser } from "../helpers";

afterAll(closeDb);

// Setup in the app (owner, 2026-11-12): setup can't finish until one connection has really put something on the sky.
describe("the first connection", () => {
  it("is nothing on a new account, and setup can't be told it is", async () => {
    const { run } = await makeUser();
    expect(await run((s) => firstConnection(s))).toBeNull();
    await expect(run((s) => requireFirstConnection(s))).rejects.toThrow(FIRST_CONNECTION_NEEDED);
  });

  it("doesn't count a bare connection: a Canvas, Google, Outlook or bank link with nothing behind it", async () => {
    const { user, run } = await makeUser();
    for (const provider of ["canvas", "google", "outlook", "plaid"] as const)
      await run((s) => s.tx.insert(integrations).values({ userId: user.id, provider, status: "connected", displayName: "x" }));
    expect(await run((s) => firstConnection(s))).toBeNull();
    await expect(run((s) => requireFirstConnection(s))).rejects.toThrow(FIRST_CONNECTION_NEEDED);
    // a bank account the person typed in by hand isn't a linked account either
    await run((s) => createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 1000 }));
    expect(await run((s) => firstConnection(s))).toBeNull();
  });

  it("counts a connection through what it brought: a Canvas class, a Google or Outlook event, a linked bank account", async () => {
    const canvas = await makeUser();
    await canvas.run((s) => s.tx.insert(courses).values({ userId: canvas.user.id, name: "BIO 110", source: "canvas" }));
    expect(await canvas.run((s) => firstConnection(s))).toBe("canvas");
    for (const source of ["google", "outlook"] as const) {
      const u = await makeUser();
      await u.run(async (s) => {
        const e = await createEvent(s, TZ, { title: "Standup", date: "2030-01-08", startTime: "09:00", endTime: "09:30" }, "jarvis");
        await s.tx.update(calendarEvents).set({ source }).where(eq(calendarEvents.id, e.id));
      });
      expect(await u.run((s) => firstConnection(s))).toBe(source);
    }
    const bank = await makeUser();
    await bank.run(async (s) => {
      const a = await createManualAccount(s, { name: "Checking", type: "depository", subtype: "checking", currentBalanceCents: 1000 });
      await s.tx.update(financialAccounts).set({ source: "plaid" }).where(eq(financialAccounts.id, a.id));
    });
    expect(await bank.run((s) => firstConnection(s))).toBe("bank");
  });

  it("counts classes saved from a picture (through setUpSchedule), and a work schedule's shifts", async () => {
    const a = await makeUser();
    await a.run((s) => setUpSchedule(s, TZ, { classes: [{ name: "BIO 110", days: [1, 3], startTime: "10:00", endTime: "10:50" }] }));
    expect(await a.run((s) => firstConnection(s))).toBe("classes");
    const b = await makeUser();
    await b.run((s) => setUpSchedule(s, TZ, { jobs: [{ name: "Campus Coffee", shifts: [{ date: "2030-01-07", startTime: "16:00", endTime: "21:00" }] }] }));
    expect(await b.run((s) => firstConnection(s))).toBe("shifts");
  });

  it("counts a plan told in a message (a calendar event), and a message that saved nothing counts as nothing", async () => {
    const { run } = await makeUser();
    expect(await run((s) => firstConnection(s))).toBeNull();
    await run((s) => createEvent(s, TZ, { title: "Dentist", date: "2030-01-08", startTime: "15:00", endTime: "16:00" }, "jarvis"));
    expect(await run((s) => firstConnection(s))).toBe("plans");
  });

  it("keeps the birthday rule: a connection alone doesn't finish setup", async () => {
    const { run } = await makeUser();
    await run((s) => setUpSchedule(s, TZ, { classes: [{ name: "ENG 101", days: [2], startTime: "13:00", endTime: "14:15" }] }));
    await expect(run((s) => finishOnboarding(s, {}, TZ))).rejects.toThrow();
    await run((s) => saveWelcomeProgress(s, TZ, { birthDate: "2000-01-15" }));
    await run((s) => finishSetup(s, TZ));
  });

  it("finishSetup is the one way through: a birthday first, then something real on the sky", async () => {
    const { run } = await makeUser();
    await expect(run((s) => finishSetup(s, TZ))).rejects.toThrow(BIRTHDAY_NEEDED);
    await run((s) => saveWelcomeProgress(s, TZ, { birthDate: "2000-01-15" }));
    await expect(run((s) => finishSetup(s, TZ))).rejects.toThrow(FIRST_CONNECTION_NEEDED);
    await run((s) => setUpSchedule(s, TZ, { classes: [{ name: "ENG 101", days: [2], startTime: "13:00", endTime: "14:15" }] }));
    await run((s) => finishSetup(s, TZ));
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
