import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { addDaysStr, todayIn } from "@/lib/dates";
import { connectCanvasFeed, syncCanvas } from "@/server/integrations/canvas";
import { collectSnapshot } from "@/server/briefing/collect";
import { listInsights } from "@/server/services/insights";
import { listAssignments, listCourses, updateCourse } from "@/server/services/school";
import { makeUser } from "../helpers";

afterAll(closeDb);
const TZ = "America/New_York";
const FEED = "https://state.instructure.com/feeds/calendars/user_AbC123dEf456GhI789jKl.ics";

// Canvas's feed names a class only by its code in brackets; at some schools that code is a bare number.
const feed = (day: string) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:event-assignment-901",
    `DTSTART:${day.replace(/-/g, "")}T150000Z`,
    "SUMMARY:Exam 2 [23543]",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

describe('a class Canvas only knows by a number (owner, 2026-11-12: "it has to know")', () => {
  it("is never shown as the number, is asked about once, and keeps its name through the next sync", async () => {
    const { run } = await makeUser();
    const today = todayIn(TZ);
    const body = feed(addDaysStr(today, 4));
    const f = (async (url: string) => (url === FEED ? new Response(body, { status: 200 }) : new Response("nope", { status: 404 }))) as unknown as typeof fetch;
    await run((s) => connectCanvasFeed(s, FEED, f));
    await run((s) => syncCanvas(s, f, TZ));
    const [course] = await run((s) => listCourses(s));
    expect(course.name).toBe("23543");

    // the sky's words use the exam's own title, never the number
    const snap = await run((s) => collectSnapshot(s, { name: "Test Person", timezone: TZ, preferences: {} }, new Date()));
    expect(snap.exams.map((e) => e.course)).toEqual([""]);

    // the skyling asks which class it is, with the bar filled for the answer
    const ask = (await run((s) => listInsights(s, TZ, undefined))).find((i) => i.kind === "course_name");
    expect(ask).toMatchObject({ headline: "Which class is 23543?", action: { label: "Name it", ask: "My class 23543 is called " } });

    // naming it keeps the number as the code, so the next sync finds it and makes no second class
    await run((s) => updateCourse(s, course.id, { name: "Ethics" }));
    await run((s) => syncCanvas(s, f, TZ));
    const after = await run((s) => listCourses(s));
    expect(after.map((c) => [c.name, c.code])).toEqual([["Ethics", "23543"]]);
    const work = await run((s) => listAssignments(s, TZ, { view: "all" }));
    expect(work.map((a) => [a.title, a.course.name])).toEqual([["Exam 2", "Ethics"]]);
    expect((await run((s) => listInsights(s, TZ, undefined))).some((i) => i.kind === "course_name")).toBe(false);
  });
});
