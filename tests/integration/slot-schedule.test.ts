import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { notificationLog } from "@/server/db/schema";
import { runDueSlot, scheduledFrom } from "@/server/services/proactive/engine";
import { makeUser } from "../helpers";

const TZ = "America/New_York";
/** A moment on Nov 10, 2026 in New York (UTC-5 that day). */
const at = (hhmm: string) => new Date(`2026-11-10T${hhmm}:00-05:00`);

afterAll(() => closeDb());

describe("the scheduler runs often, and each daily look starts at its own time", () => {
  const slots = async (run: Awaited<ReturnType<typeof makeUser>>["run"]) =>
    (await run((s) => s.tx.select({ key: notificationLog.key }).from(notificationLog)))
      .map((r) => r.key)
      .filter((k) => k.startsWith("slot:"))
      .sort();

  it("the notify job is scheduled every 10 minutes, so reminders arrive within minutes of their time", () => {
    const { crons } = JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] };
    expect(crons.find((c) => c.path === "/api/cron/notify")?.schedule).toBe("*/10 * * * *");
  });

  it("morning waits for the end of quiet hours, midday for noon, evening for 8", () => {
    expect(scheduledFrom("morning", "07:00")).toBe("07:00");
    expect(scheduledFrom("morning", "08:30")).toBe("08:30");
    // quiet hours that end at an odd time never push the morning look into the afternoon, or before dawn
    expect(scheduledFrom("morning", "11:00")).toBe("07:00");
    expect(scheduledFrom("morning", "03:00")).toBe("07:00");
    expect(scheduledFrom("midday", "07:00")).toBe("12:00");
    expect(scheduledFrom("evening", "07:00")).toBe("20:00");
  });

  it("from the scheduler: nothing at 12:05 AM or 5:30 PM; the look runs once its time has come, once", async () => {
    const { user, run } = await makeUser("Slot Sched");
    const scheduled = (hhmm: string) => run((s) => runDueSlot(s, TZ, user.preferences, at(hhmm), { scheduled: true }));
    await scheduled("00:05");
    await scheduled("06:50");
    expect(await slots(run)).toEqual([]);
    await scheduled("07:00");
    await scheduled("07:10");
    expect(await slots(run)).toEqual(["slot:2026-11-10:morning"]);
    await scheduled("12:00");
    await scheduled("17:30");
    await scheduled("19:50");
    expect(await slots(run)).toEqual(["slot:2026-11-10:midday", "slot:2026-11-10:morning"]);
    await scheduled("20:00");
    expect(await slots(run)).toEqual(["slot:2026-11-10:evening", "slot:2026-11-10:midday", "slot:2026-11-10:morning"]);
  });

  it("opening Today still runs the current look straight away, at any hour", async () => {
    const { user, run } = await makeUser("Slot Open");
    await run((s) => runDueSlot(s, TZ, user.preferences, at("00:05")));
    await run((s) => runDueSlot(s, TZ, user.preferences, at("17:30")));
    expect(await slots(run)).toEqual(["slot:2026-11-10:evening", "slot:2026-11-10:morning"]);
  });
});
