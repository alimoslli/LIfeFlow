import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { addDaysStr, todayIn } from "@/lib/dates";
import { canvasBaseUrl, canvasConnection, canvasFeedUrl, canvasKind, connectCanvas, connectCanvasFeed, syncCanvas } from "@/server/integrations/canvas";
import { getAgenda } from "@/server/services/calendar";
import { listAssignments, listCourses } from "@/server/services/school";
import { makeUser } from "../helpers";

afterAll(closeDb);
const TZ = "America/New_York";
const BASE = "https://canvas.state.edu";
const TOKEN = "1234~abcdefghijklmnopqrstuvwxyz";

/** A small fake Canvas: one course, assignments over two pages, and a "next" link that tries to leave the school's domain. */
function fakeCanvas(due: string) {
  const calls: string[] = [];
  const json = (body: unknown, link?: string) => new Response(JSON.stringify(body), { status: 200, headers: link ? { link } : {} });
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push(url);
    if ((init.headers as Record<string, string>).authorization !== `Bearer ${TOKEN}`) return new Response("{}", { status: 401 });
    if (url.endsWith("/api/v1/users/self")) return json({ name: "Sam Ortiz" });
    if (url.includes("/api/v1/courses?"))
      return json([
        { id: 101, name: "Biology II", course_code: "BIO 202" },
        { id: 102, name: "Old", access_restricted_by_date: true },
      ]);
    if (url.includes("/courses/101/assignments") && !url.includes("page=2"))
      return json(
        [
          { id: 1, name: "Midterm Exam", due_at: due, points_possible: 100, html_url: `${BASE}/courses/101/assignments/1`, published: true },
          { id: 2, name: "Quiz 3", due_at: null, points_possible: 10, submission_types: ["online_quiz"], published: true },
        ],
        `<${BASE}/api/v1/courses/101/assignments?page=2>; rel="next"`,
      );
    if (url.includes("page=2"))
      return json(
        [{ id: 3, name: "Lab 4", due_at: due, points_possible: 20, html_url: "https://evil.example/x", published: true }],
        `<https://evil.example/next>; rel="next"`,
      );
    return new Response("[]", { status: 404 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

describe("Canvas", () => {
  it("reads addresses and assignment types", () => {
    expect(canvasBaseUrl("canvas.state.edu/courses")).toBe(BASE);
    expect(canvasBaseUrl("http://canvas.state.edu")).toBe(BASE);
    expect(canvasBaseUrl("nope")).toBeNull();
    expect(canvasKind({ name: "Final Exam", submission_types: [] })).toBe("exam");
    expect(canvasKind({ name: "Week 2", submission_types: ["discussion_topic"] })).toBe("discussion");
  });

  it("connects, syncs read-only, and updates instead of duplicating", async () => {
    const { run } = await makeUser();
    const bad = fakeCanvas("2026-11-10T15:00:00Z");
    await expect(run((s) => connectCanvas(s, "canvas.state.edu", "x".repeat(25), bad.fetchImpl))).rejects.toThrow(/didn't accept/);

    const c = fakeCanvas("2026-11-10T15:00:00Z");
    expect(await run((s) => connectCanvas(s, "canvas.state.edu", TOKEN, c.fetchImpl))).toEqual({ name: "Sam Ortiz", host: "canvas.state.edu" });
    expect(await run((s) => syncCanvas(s, c.fetchImpl))).toEqual({ courses: 1, newCourses: 1, assignments: 3, events: 0 });
    expect(c.calls.some((u) => u.includes("evil.example"))).toBe(false);

    const [course] = await run((s) => listCourses(s));
    expect(course).toMatchObject({ name: "Biology II", code: "BIO 202", source: "canvas" });
    const all = await run((s) => listAssignments(s, TZ, { view: "all" }));
    expect(all.map((a) => [a.title, a.kind]).sort()).toEqual([
      ["Lab 4", "lab"],
      ["Midterm Exam", "exam"],
      ["Quiz 3", "quiz"],
    ]);
    expect(all.find((a) => a.title === "Lab 4")!.url).toBeNull(); // links off the school's Canvas aren't kept

    const moved = fakeCanvas("2026-11-12T15:00:00Z");
    expect(await run((s) => syncCanvas(s, moved.fetchImpl))).toMatchObject({ newCourses: 0, assignments: 3 });
    const after = await run((s) => listAssignments(s, TZ, { view: "all" }));
    expect(after).toHaveLength(3);
    expect(after.find((a) => a.title === "Midterm Exam")!.dueAt!.toISOString()).toBe("2026-11-12T15:00:00.000Z");
    expect(await run((s) => canvasConnection(s))).toMatchObject({ host: "canvas.state.edu", status: "connected" });
  });

  it("only accepts real Canvas feed links", () => {
    const ok = "https://state.instructure.com/feeds/calendars/user_AbC123dEf456GhI789jKl.ics";
    expect(canvasFeedUrl(ok)).toBe(ok);
    expect(canvasFeedUrl(ok.replace("https://", "webcal://"))).toBe(ok);
    expect(canvasFeedUrl(`${ok}?x=1`)).toBe(ok); // query dropped
    for (const bad of [
      "http://state.instructure.com/feeds/calendars/user_AbC123dEf456GhI789jKl.ics",
      "https://127.0.0.1/feeds/calendars/user_AbC123dEf456GhI789jKl.ics",
      "https://localhost/feeds/calendars/user_AbC123dEf456GhI789jKl.ics",
      "https://state.instructure.com:8443/feeds/calendars/user_AbC123dEf456GhI789jKl.ics",
      "https://state.instructure.com/api/v1/users/self",
      "https://state.instructure.com/feeds/calendars/user_short.ics",
    ])
      expect(canvasFeedUrl(bad), bad).toBeNull();
  });

  it("syncs the Calendar Feed: assignments by Canvas id, class events, nothing already past", async () => {
    const { run } = await makeUser();
    const FEED = "https://state.instructure.com/feeds/calendars/user_AbC123dEf456GhI789jKl.ics";
    const today = todayIn(TZ);
    const ics = (d: string) => d.replace(/-/g, "");
    const feed = (examDay: string) =>
      [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:event-assignment-501",
        `DTSTART:${ics(examDay)}T035900Z`,
        "SUMMARY:Midterm Exam [BIO 202]",
        "URL:https://state.instructure.com/calendar?include_contexts=course_101&month=11#assignment_501",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:event-assignment-502",
        `DTSTART;VALUE=DATE:${ics(addDaysStr(today, 3))}`,
        "SUMMARY:Reading response\\, ch. 4 [ENG 101]",
        "URL:https://evil.example/courses/7",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:event-assignment-400",
        `DTSTART:${ics(addDaysStr(today, -5))}T035900Z`,
        "SUMMARY:Old essay [ENG 101]",
        "END:VEVENT",
        "BEGIN:VEVENT",
        "UID:event-calendar-event-77",
        `DTSTART:${ics(addDaysStr(today, 2))}T140000Z`,
        `DTEND:${ics(addDaysStr(today, 2))}T153000Z`,
        "SUMMARY:Review session [BIO 202]",
        "LOCATION:Room 210",
        "URL:https://state.instructure.com/calendar?include_contexts=course_101",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n");
    let body = feed(addDaysStr(today, 6));
    const calls: RequestInit[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push(init);
      return url === FEED ? new Response(body, { status: 200 }) : new Response("nope", { status: 404 });
    }) as unknown as typeof fetch;

    await expect(run((s) => connectCanvasFeed(s, "https://state.instructure.com/feeds/calendars/user_WRONGWRONGWRONGWRONG.ics", f))).rejects.toThrow(
      /didn't recognise/,
    );
    expect(await run((s) => connectCanvasFeed(s, FEED, f))).toEqual({ name: null, host: "state.instructure.com" });
    expect(calls.every((c) => c.redirect === "error")).toBe(true);
    expect(await run((s) => syncCanvas(s, f, TZ))).toEqual({ courses: 2, newCourses: 2, assignments: 2, events: 1 });

    const work = await run((s) => listAssignments(s, TZ, { view: "all" }));
    expect(work.map((a) => [a.title, a.kind, a.course.name, a.dueAllDay]).sort()).toEqual([
      ["Midterm Exam", "exam", "BIO 202", false],
      ["Reading response, ch. 4", "assignment", "ENG 101", true],
    ]);
    expect(work.find((a) => a.title === "Midterm Exam")!.url).toContain("state.instructure.com");
    expect(work.find((a) => a.title.startsWith("Reading"))!.url).toBeNull();
    const agenda = await run((s) => getAgenda(s, TZ, today, addDaysStr(today, 7), { include: ["event"] }));
    expect(agenda.map((e) => e.title)).toEqual(["Review session"]);

    // A moved exam updates in place; the class event isn't duplicated.
    body = feed(addDaysStr(today, 8));
    expect(await run((s) => syncCanvas(s, f, TZ))).toMatchObject({ newCourses: 0, assignments: 2, events: 0 });
    const after = await run((s) => listAssignments(s, TZ, { view: "all" }));
    expect(after).toHaveLength(2);
    expect(after.find((a) => a.title === "Midterm Exam")!.dueAt!.toISOString()).toBe(`${addDaysStr(today, 8)}T03:59:00.000Z`);
    expect(await run((s) => canvasConnection(s))).toMatchObject({ via: "feed", status: "connected" });
  });
});
