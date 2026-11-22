import { describe, expect, it } from "vitest";
import { firstStep, focusHref, startable, FIRST_MINUTES } from "@/lib/first-step";
import { clockLeft, clockUp, focusCheck, OVER_BY_MINUTES } from "@/lib/focus-check";
import { HEADS_UP_DEFAULT, headsUpMinutes } from "@/lib/heads-up";

// The ADHD helps (owner, 2026-11-22; docs/backlog/2026-11-22-adhd-six.md): Start it, Sit with me and the check-in.
describe("the first step is small and comes from what the thing is", () => {
  it.each([
    ["exam", "Midterm 2", "Open your notes and read the first page."],
    ["quiz", "Quiz 4", "Open your notes and read the first page."],
    ["task", "Study for bio", "Open your notes and read the first page."],
    ["reading", "Ch. 7", "Open to the first page and read one paragraph."],
    ["assignment", "Read chapter 3", "Open to the first page and read one paragraph."],
    ["discussion", "Week 9 discussion", "Open the prompt and write one sentence back."],
    ["project", "Final presentation", "Make the first slide with just a title."],
    ["assignment", "Reflection essay", "Open a doc and type the title."],
    ["lab", "Lab 5", "Open the lab sheet and read the first step."],
    ["assignment", "Problem Set 12", "Write out the first problem."],
    ["project", "Capstone", "Write down the very first thing it needs."],
    ["task", "Email advisor", "Open a new message and write the first line."],
    ["task", "Laundry", "Pick up five things."],
    ["task", "Renew passport", `Do the first ${FIRST_MINUTES} minutes. That's all.`],
  ])("%s %s", (kind, title, step) => {
    expect(firstStep(kind, title)).toBe(step);
  });

  it("every step is one short sentence with no guilt words or dashes", () => {
    const kinds = ["assignment", "exam", "quiz", "project", "reading", "lab", "discussion", "other", "task"];
    for (const k of kinds)
      for (const t of ["Essay", "Read ch 2", "HW 3", "Slides", "Email", "Clean room", "Thing"]) {
        const s = firstStep(k, t);
        expect(s.length).toBeLessThan(60);
        expect(s).not.toMatch(/—|should|must|late|behind|missed/i);
      }
  });

  it("only work you do can be started: to-dos and assignments, never a class, shift or meeting", () => {
    const id = "3f8c1b8e-6a39-4d43-9c7e-5b1f2a7d9e01";
    expect(startable(`task:${id}`)).toEqual({ origin: "task", id });
    expect(startable(`assignment:${id}`)).toEqual({ origin: "assignment", id });
    expect(startable(`event:${id}:2026-11-24T15:00:00.000Z`)).toBeNull();
    expect(startable(`shift:${id}`)).toBeNull();
    expect(startable("task:../../etc")).toBeNull();
    expect(focusHref(`task:${id}`)).toBe(`/focus?item=task%3A${id}`);
  });
});

describe("the check-in speaks only inside a session, gently", () => {
  const start = Date.parse("2026-11-24T14:00:00Z");
  const min = (m: number) => start + m * 60_000;
  const next = { title: "Bio 101", at: new Date(min(90)).toISOString(), clock: "10:30 AM" };

  it("says nothing while the session is going as planned", () => {
    expect(focusCheck({ startedAt: start, plannedMinutes: 25, now: min(10), next, headsUp: 15 })).toBeNull();
    expect(focusCheck({ startedAt: start, plannedMinutes: 25, now: min(25 + OVER_BY_MINUTES - 1), next: null, headsUp: 15 })).toBeNull();
  });

  it("names the next thing once it's within the heads-up, and when it has started", () => {
    expect(focusCheck({ startedAt: start, plannedMinutes: 25, now: min(76), next, headsUp: 15 })).toBe("Bio 101 is at 10:30 AM. Want to wrap up?");
    expect(focusCheck({ startedAt: start, plannedMinutes: 25, now: min(91), next, headsUp: 15 })).toBe("Bio 101 has started (10:30 AM).");
    // the person turned the heads-up off: no wrap-up line, only the gentle time check
    expect(focusCheck({ startedAt: start, plannedMinutes: 25, now: min(76), next, headsUp: 0 })).toBe("It's been 76 minutes. A short break?");
  });

  it("says how long it's been once it runs well past the plan", () => {
    expect(focusCheck({ startedAt: start, plannedMinutes: 5, now: min(5 + OVER_BY_MINUTES), next: null, headsUp: 15 })).toBe(
      "It's been 25 minutes. A short break?",
    );
  });

  it("the clock counts down and never goes below 0:00", () => {
    expect(clockLeft(5 * 60_000)).toBe("5:00");
    expect(clockLeft(61_500)).toBe("1:02");
    expect(clockLeft(-3000)).toBe("0:00");
    expect(clockUp(0)).toBe("0:00");
    expect(clockUp(12 * 60_000 + 3000)).toBe("12:03");
    expect(clockUp(3600_000 + 5 * 60_000)).toBe("1:05:00");
  });
});

describe("the heads-up minutes are the person's own", () => {
  it("defaults to 15 and accepts only the offered choices", () => {
    expect(headsUpMinutes(undefined)).toBe(HEADS_UP_DEFAULT);
    expect(headsUpMinutes({ notifications: { headsUp: 30 } })).toBe(30);
    expect(headsUpMinutes({ notifications: { headsUp: 0 } })).toBe(0);
    expect(headsUpMinutes({ notifications: { headsUp: 7 } })).toBe(HEADS_UP_DEFAULT);
  });
});
