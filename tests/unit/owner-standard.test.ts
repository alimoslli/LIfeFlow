import { describe, expect, it } from "vitest";
import { addDaysStr } from "@/lib/dates";
import { computeLifeLoad, loadFacts } from "@/lib/life-load";
import { chooseVerbosity } from "@/server/jarvis/effort";
import { buildSystemPrompt, PROMPT_VERSION, REPLY_SHAPE } from "@/server/jarvis/prompt";
import { RATING_REASONS, RATING_REASON_LABELS, isRatingReason } from "@/lib/answer-rating";

/**
 * The owner's standard for an answer, from his own grades of eight real answers on 2026-11-26
 * (docs/research/2026-11-27-skyling-standard-in-the-app.md). It lives in the instructions every model gets.
 */
const prompt = buildSystemPrompt({ userName: "Robin", tz: "America/New_York", now: new Date("2026-11-27T15:00:00Z"), accountKind: "standard", memories: [] });
const fixed = prompt.split("# Who you are")[0];

describe("the owner's standard is in the instructions (2026-11-27)", () => {
  it("a quick message gets a quick answer", () => {
    expect(fixed).toMatch(/A quick message .* gets a quick answer: usually under 40 words and at most about 60 words/);
    expect(fixed).toMatch(/People hate reading and typing/);
  });
  it("no strict cap when they ask for real help, a breakdown or the steps", () => {
    expect(fixed).toMatch(/there is no fixed limit: answer as fully as it needs, and no longer/);
    expect(fixed).toMatch(/A breakdown has as many steps as the work really has/);
    // the earlier decision stays: a multi-day plan belongs in the app, never a day-by-day schedule in chat
    expect(fixed).toMatch(/Never write a day-by-day schedule/);
    expect(fixed).toMatch(/a multi-day plan belongs in the app/);
  });
  it("stops when the job is done, never asks what a look would answer, never says it will work later", () => {
    expect(fixed).toMatch(/When the job is done, stop: .* confirm it in one short line/);
    expect(fixed).toMatch(/look first \(get_daily_briefing or list_assignments\): the nearest one is usually the one they mean/);
    expect(fixed).toMatch(/At most one open question and one yes-or-no offer in a reply/);
    expect(fixed).toMatch(/It works here or it doesn't/);
    expect(fixed).toMatch(/Never say it will work later, and never offer to try again in a bit/);
  });
  it('names things, never "items", and says the star when a tick earned one', () => {
    expect(fixed).toMatch(/never "items"/);
    expect(fixed).toMatch(/When a result says star: true, the thing they ticked earned a star on their sky/);
  });
  it('"are you an AI": in its own words, more when asked more, never a model or a company', () => {
    expect(fixed).toMatch(/Say it in your own words, never as a set line, and if they keep asking, tell them more/);
    expect(fixed).toMatch(/an AI built for LifeFlow to help them keep their life in order/);
    expect(fixed).toMatch(/Never name the model, company or provider behind you/);
  });
  it("the last reminder carries it too, after the distress line, and the version moved", () => {
    const lines = REPLY_SHAPE.split("\n");
    expect(lines[1]).toMatch(/When someone is struggling/);
    expect(lines[2]).toMatch(/A quick message gets a quick answer/);
    expect(lines[2]).toMatch(/as long as it needs and no longer/);
    expect(prompt.endsWith(REPLY_SHAPE)).toBe(true);
    expect(PROMPT_VERSION >= "2026-11-27.1").toBe(true);
    // user-facing rules stay: no em dashes in what the model is shown as its voice, no model names
    expect(fixed).not.toMatch(/\b(gpt|openai|chatgpt|claude|anthropic|qwen)\b/i);
  });
  it("the model's own length setting gives real help more room and keeps everything else short", () => {
    expect(chooseVerbosity("what's due")).toBe("low");
    expect(chooseVerbosity("thanks")).toBe("low");
    // a week plan stays short: plans belong in the app (owner, 2026-11-09)
    expect(chooseVerbosity("plan my week")).toBe("low");
    expect(chooseVerbosity("my thesis feels huge, break it down for me")).toBe("medium");
    expect(chooseVerbosity("can you explain how compound interest works")).toBe("medium");
    expect(chooseVerbosity("how do I start saving")).toBe("medium");
    expect(chooseVerbosity("hey", "detailed")).toBe("medium");
  });
});

describe("the week's load for the skyling (life_load)", () => {
  const TODAY = "2026-11-02";
  it("speaks in each day's own figure and names the nearest light day", () => {
    const w = computeLifeLoad({
      today: TODAY,
      committed: [
        { date: TODAY, minutes: 8.5 * 60, label: "Work 9 AM to 5:30 PM" },
        { date: addDaysStr(TODAY, 1), minutes: 5 * 60, label: "Class" },
        { date: addDaysStr(TODAY, 2), minutes: 60, label: "Lab" },
      ],
      tasks: [],
      deadlines: [],
    });
    // the screen's line rounds to whole hours, which a model then quoted beside the day's own 8.5
    expect(w.summary).toMatch(/about 9 hours/);
    const f = loadFacts(w);
    expect(f.summary).toBe("Today is the fullest day at 8.5 hours. The nearest light day is Wednesday (1 hour).");
    expect(f.fullest).toEqual({ date: TODAY, label: "Today", level: "heavy", hours: 8.5 });
    expect(f.nearestLight?.label).toBe("Wednesday");
    expect(f.summary).not.toMatch(/about/);
  });
  it("says so when no day is light, and when one day is too full", () => {
    const every = Array.from({ length: 7 }, (_, k) => ({ date: addDaysStr(TODAY, k), minutes: (k === 3 ? 11.5 : 5) * 60, label: "Work" }));
    const f = loadFacts(computeLifeLoad({ today: TODAY, committed: every, tasks: [], deadlines: [] }));
    expect(f.nearestLight).toBeNull();
    expect(f.summary).toBe(
      "Thursday is too full at 11.5 hours, 1.5 hours more than fits in a day. No day this week is light; the lightest is Today (5 hours). Today comes before the fullest day and is lighter, so work can start then.",
    );
  });
  it("a light week says so with its figure", () => {
    const f = loadFacts(computeLifeLoad({ today: TODAY, committed: [{ date: TODAY, minutes: 48, label: "Gym" }], tasks: [], deadlines: [] }));
    expect(f.summary).toBe("A light week: the fullest day is Today at 48 minutes.");
  });
});

describe("why an answer got a thumbs-down", () => {
  it("is one of four fixed taps, never typed words", () => {
    expect(RATING_REASONS).toEqual(["too_long", "wrong", "not_done", "off_point"]);
    for (const r of RATING_REASONS) expect(RATING_REASON_LABELS[r].length).toBeLessThanOrEqual(18);
    expect(isRatingReason("too_long")).toBe(true);
    expect(isRatingReason("it was rude and here is my homework")).toBe(false);
    expect(isRatingReason(null)).toBe(false);
  });
});
