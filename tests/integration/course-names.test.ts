import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { addDaysStr, todayIn } from "@/lib/dates";
import { connectCanvasFeed, syncCanvas } from "@/server/integrations/canvas";
import { collectSnapshot } from "@/server/briefing/collect";
import { listInsights } from "@/server/services/insights";
import { listAssignments, listCourses, updateCourse } from "@/server/services/school";
import { runJarvisTurn } from "@/server/jarvis/agent";
import { ScriptedProvider } from "@/server/jarvis/providers/scripted";
import type { SessionUser } from "@/server/auth/sessions";
import { makeUser } from "../helpers";

afterAll(closeDb);
const TZ = "America/New_York";
const FEED = "https://state.instructure.com/feeds/calendars/user_AbC123dEf456GhI789jKl.ics";

// Canvas's feed names a class only by its code in brackets; at some schools that code is a bare number.
const feed = (day: string, label = "23543") =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:event-assignment-901",
    `DTSTART:${day.replace(/-/g, "")}T150000Z`,
    `SUMMARY:Exam 2 [${label}]`,
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

  const synced = async (label = "23543") => {
    const u = await makeUser();
    const body = feed(addDaysStr(todayIn(TZ), 4), label);
    const f = (async (url: string) => (url === FEED ? new Response(body, { status: 200 }) : new Response("nope", { status: 404 }))) as unknown as typeof fetch;
    await u.run((s) => connectCanvasFeed(s, FEED, f));
    await u.run((s) => syncCanvas(s, f, TZ));
    const [course] = await u.run((s) => listCourses(s));
    const again = async () => (await u.run((s) => syncCanvas(s, f, TZ)), u.run((s) => listCourses(s)));
    return { ...u, course, again };
  };

  // COO review M1: the Edit form sends an empty Code box as null, the skyling may send ""; neither may drop the number
  for (const code of [null, ""]) {
    it(`renamed with the code box ${code === null ? "empty (null)" : 'as ""'}: the number stays, one class after the next sync`, async () => {
      const { run, course, again } = await synced();
      await run((s) => updateCourse(s, course.id, { name: "Ethics", code }));
      expect((await again()).map((c) => [c.name, c.code])).toEqual([["Ethics", "23543"]]);
      // and saving the form again later, the box still empty, keeps it
      await run((s) => updateCourse(s, course.id, { name: "Ethics", code }));
      expect((await again()).map((c) => [c.name, c.code])).toEqual([["Ethics", "23543"]]);
    });
  }

  it("a long feed label is kept whole (at the name's 200 cap, not the form's 40), so it still matches (L2)", async () => {
    const long = "2026FA-PHIL-2306-23543-ONLINE-SECTION-OF-ETHICS-AND-SOCIETY-THURSDAYS";
    const { run, course, again } = await synced(long);
    await run((s) => updateCourse(s, course.id, { name: "Ethics", code: null }));
    expect((await again()).map((c) => [c.name, c.code])).toEqual([["Ethics", long]]);
  });

  it("a class the person named, even with only digits, is never asked about again (L1)", async () => {
    const { run, course } = await synced();
    await run((s) => updateCourse(s, course.id, { name: "101" }));
    expect((await run((s) => listInsights(s, TZ, undefined))).some((i) => i.kind === "course_name")).toBe(false);
  });

  it("the skyling's own rename finds the class with list_courses and keeps one class after the next sync (L3)", async () => {
    const { run, user, course, again } = await synced();
    const session: SessionUser = { id: user.id, email: user.email, name: user.name, timezone: TZ, accountKind: "standard" };
    let found = "";
    const provider = new ScriptedProvider(({ step, results }) => {
      if (step === 0) return { toolCalls: [{ name: "list_courses", args: {} }] };
      if (step === 1) {
        const list = (JSON.parse(results[0].output) as { data: { courses: { id: string; name: string }[] } }).data.courses;
        found = list.find((c) => c.name === "23543")!.id;
        return { toolCalls: [{ name: "update_course", args: { id: found, name: "Ethics" } }] };
      }
      return { text: "Got it, 23543 is Ethics." };
    });
    await runJarvisTurn({ user: session, text: "My class 23543 is called Ethics", provider, emit: () => {} });
    expect(found).toBe(course.id);
    expect((await again()).map((c) => [c.name, c.code])).toEqual([["Ethics", "23543"]]);
    await expect(run((s) => listInsights(s, TZ, undefined))).resolves.not.toContainEqual(expect.objectContaining({ kind: "course_name" }));
  });
});
