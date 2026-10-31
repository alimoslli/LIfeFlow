import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { createEvent, editOccurrence, expandOccurrences, listEventsInRange, skipOccurrence } from "@/server/services/calendar";
import { makeUser } from "../helpers";

afterAll(closeDb);
const TZ = "America/New_York";

describe("one day of a repeating event", () => {
  it("removes just that day from the series, and only for that series", async () => {
    const { run } = await makeUser();
    const ev = await run((s) =>
      createEvent(s, TZ, { title: "Shift", date: "2027-01-04", startTime: "10:00", endTime: "19:00", recurrence: { freq: "daily", until: "2027-01-10" } }),
    );
    const dates = async () => (await run((s) => listEventsInRange(s, TZ, "2027-01-04", "2027-01-10"))).map((e) => e.startsAt.toISOString().slice(0, 10));
    expect(await dates()).toHaveLength(7);
    await run((s) => skipOccurrence(s, ev.id, "2027-01-06"));
    const after = await dates();
    expect(after).toHaveLength(6);
    expect(after).not.toContain("2027-01-06");
    expect(after).toContain("2027-01-05");
    expect(after).toContain("2027-01-07");
  });

  it("changes one day into its own event without touching the rest", async () => {
    const { run } = await makeUser();
    const ev = await run((s) =>
      createEvent(s, TZ, { title: "Lab", date: "2027-01-04", startTime: "09:00", endTime: "10:00", recurrence: { freq: "weekly", byDay: [1] } }),
    );
    await run((s) =>
      editOccurrence(s, TZ, ev.id, "2027-01-11", {
        title: "Lab (moved)",
        date: "2027-01-12",
        startTime: "14:00",
        endTime: "15:00",
        allDay: false,
        kind: "class",
      }),
    );
    const all = await run((s) => listEventsInRange(s, TZ, "2027-01-04", "2027-01-15"));
    // Monday 4th stays, Monday 11th is replaced by the moved event on the 12th.
    expect(all.map((e) => e.title).sort()).toEqual(["Lab", "Lab (moved)"]);
    expect(
      all
        .find((e) => e.title === "Lab (moved)")!
        .startsAt.toISOString()
        .slice(0, 10),
    ).toBe("2027-01-12");
  });

  it("refuses to skip a day of a one-off event", async () => {
    const { run } = await makeUser();
    const ev = await run((s) => createEvent(s, TZ, { title: "Dentist", date: "2027-01-04", startTime: "09:00", endTime: "10:00" }));
    await expect(run((s) => skipOccurrence(s, ev.id, "2027-01-04"))).rejects.toThrow(/doesn't repeat/);
  });

  it("expands series with skipped days removed (pure)", () => {
    const base = new Date("2027-01-04T15:00:00Z");
    const out = expandOccurrences(
      { startsAt: base, endsAt: new Date(base.getTime() + 3600_000), allDay: false, recurrence: { freq: "daily", skip: ["2027-01-05"] } },
      "2027-01-04",
      "2027-01-06",
      TZ,
    );
    expect(out).toHaveLength(2);
  });
});
