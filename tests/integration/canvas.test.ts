import { afterAll, describe, expect, it } from "vitest";
import { closeDb } from "@/server/db/client";
import { canvasBaseUrl, canvasConnection, canvasKind, connectCanvas, syncCanvas } from "@/server/integrations/canvas";
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
    expect(await run((s) => syncCanvas(s, c.fetchImpl))).toEqual({ courses: 1, newCourses: 1, assignments: 3 });
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
});
