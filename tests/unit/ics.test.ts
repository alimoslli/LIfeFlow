import { describe, expect, it } from "vitest";
import { parseIcs } from "@/lib/ics";

describe("calendar feed reader", () => {
  it("unfolds long lines, unescapes text and reads time zones", () => {
    const text = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:event-assignment-9",
      "DTSTART;TZID=America/Chicago:20261105T235900",
      "SUMMARY:A very long assignment name that Canvas folds onto",
      "  a second line\; with a semicolon [HIST 110]",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "SUMMARY:No UID, ignored",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    expect(parseIcs(text)).toEqual([
      {
        uid: "event-assignment-9",
        summary: "A very long assignment name that Canvas folds onto a second line; with a semicolon [HIST 110]",
        start: { date: "2026-11-05", time: "23:59", utc: false, tzid: "America/Chicago" },
        end: null,
        url: null,
        location: null,
      },
    ]);
  });
});
