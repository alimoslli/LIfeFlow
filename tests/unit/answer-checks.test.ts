import { describe, expect, it } from "vitest";
import { CHECK_CODES, checkAnswer, checkToolCalls, fixNote, saidClock, wordLimit, type CheckCode, type CheckContext } from "@/server/jarvis/answer-checks";
import { MODE_LINES } from "@/server/jarvis/prompt";

/**
 * The same cases as `python3 scripts/gpu/chat-eval/reality_checks.py` on claude/skill-router-pilot (the checks that guard the
 * skyling's training examples), so the app and the examples judge an answer the same way. Each is a real one from the read
 * of 2026-11-25 or from the owner's grades of 2026-11-26, with the verdict it must get.
 */
const TZ = "America/Chicago";
// Saturday, November 21, 2026 in Chicago (UTC-6)
const at = (hhmm: string) => new Date(`2026-11-21T${hhmm}:00-06:00`);
const late = at("21:20");
const noon = at("12:30");

type Call = [name: string, args: unknown];
function ctx(now: Date, said: string[], calls: Call[] = [], results: string[] = []): CheckContext {
  return {
    now,
    tz: TZ,
    asked: said[said.length - 1],
    sources: [
      `# Right now\nUser: Maya. Now: Saturday, November 21, 2026 at ${saidClock(now.getUTCHours() * 60)} (${TZ}). Today is 2026-11-21.`,
      ...said,
      ...results,
    ],
    used: calls.map(([n]) => n),
  };
}
const codes = (c: CheckContext, text: string) => checkAnswer(c, text).map((n) => n.code);
const callCodes = (c: CheckContext, calls: Call[]) =>
  checkToolCalls(
    c,
    calls.map(([name, args]) => ({ name, arguments: JSON.stringify(args) })),
  ).map((n) => n.code);

describe("answer checks: the clock", () => {
  it("a class already over is not spoken of as still ahead", () => {
    expect(
      codes(
        ctx(late, ["I've got the flu, today is not happening"]),
        "Sorry you're down. Today you'd miss BIO 418 Biology I at 12:00 PM, and HIST 374 Quiz 3 is due 11:59 PM tonight.",
      ),
    ).toContain("past_time");
  });
  it("reads a sentence clause by clause: the quiz tonight is fine, the 2:15 PM block is gone", () => {
    expect(
      codes(ctx(at("18:45"), ["[opened the app]"]), "Hey! Big one tonight: HIST 374 Quiz 3 is due at 11:59 PM, and you've got a study block at 2:15 PM."),
    ).toContain("past_time");
  });
  it("does not offer an evening at 11:30 PM", () => {
    expect(codes(ctx(at("23:30"), ["I'm behind"]), "Want me to block study time this evening?")).toContain("past_time");
  });
  it("leaves the past spoken of as past, another day, and time still ahead alone", () => {
    expect(codes(ctx(late, ["what's left today?"]), "Your shift ended at 5:00 PM, so the only thing left is Quiz 3, due at 11:59 PM tonight.")).toEqual([]);
    expect(codes(ctx(late, ["plan tomorrow"]), "Tomorrow you have BIO 110 at 10:00 AM. Want me to block 8:00 AM to 9:30 AM for the essay?")).toEqual([]);
    expect(codes(ctx(noon, ["am I free later?"]), "You're free from 2:00 PM until your shift at 5:00 PM. Want me to block it?")).toEqual([]);
  });
  it("a check-in saved for a time already gone", () => {
    const promise: Call[] = [["make_promise", { text: "start", date: "2026-11-21", time: "21:00" }]];
    expect(callCodes(ctx(at("23:30"), ["I'll start tonight, I promise"]), promise)).toEqual(["past_save"]);
    expect(callCodes(ctx(noon, ["I'll start tonight, I promise"]), promise)).toEqual([]);
    // a block still running is judged by its end, and a day already over is caught for events and promises
    expect(
      callCodes(ctx(noon, ["block now"]), [["create_events", { events: [{ title: "Study", date: "2026-11-21", startTime: "12:00", endTime: "13:00" }] }]]),
    ).toEqual([]);
    expect(callCodes(ctx(noon, ["block it"]), [["create_events", { events: [{ title: "Study", date: "2026-11-20", startTime: "15:00" }] }]])).toEqual([
      "past_save",
    ]);
    // a to-do may be due on a day that has passed (they are logging what is overdue)
    expect(callCodes(ctx(noon, ["add the essay, it was due yesterday"]), [["create_tasks", { tasks: [{ title: "Essay", dueDate: "2026-11-20" }] }]])).toEqual(
      [],
    );
  });
});

describe("answer checks: specifics from nowhere", () => {
  it("a made-up amount never reaches a tool", () => {
    const rent: Call[] = [["check_affordability", { amount: 1200, when: "this_month" }]];
    expect(callCodes(ctx(noon, ["can I afford to move out?"]), rent)).toEqual(["invented_amount"]);
    expect(callCodes(ctx(noon, ["can I afford a $1,200 laptop?"]), rent)).toEqual([]);
    // the app's own rule is "never invent a number", so a stand-in amount is caught too (the training rules allow 20 there)
    expect(callCodes(ctx(noon, ["should I go out this weekend?"]), [["check_affordability", { amount: 20, when: "this_weekend" }]])).toEqual([
      "invented_amount",
    ]);
    expect(callCodes(ctx(noon, ["what's due?"]), [["list_assignments", { limit: 50 }]])).toEqual([]);
    // a figure a result showed is theirs to use
    expect(
      callCodes(ctx(noon, ["can I afford it?"], [["query_transactions", {}]], ['{"ok":true,"data":{"rows":[{"amount":-48.5}]}}']), [
        ["check_affordability", { amount: 48.5 }],
      ]),
    ).toEqual([]);
  });
  it('"you said" needs them to have said it', () => {
    const line = "You said you study best in the mornings, so start with the quiz.";
    expect(codes(ctx(noon, ["what should I do first?"]), line)).toContain("said_from_nowhere");
    expect(codes(ctx(noon, ["I study best in the mornings. what should I do first?"]), line)).toEqual([]);
  });
  it("never says it will come back, or that something changed, with nothing saved", () => {
    expect(codes(ctx(noon, ["I need to renew my visa sometime"]), "Good call. I'll remind you next week.")).toContain("comes_back");
    expect(
      codes(
        ctx(noon, ["remind me to renew my visa"], [["create_tasks", { tasks: [{ title: "Renew visa", dueDate: "2026-11-28" }] }]], ['{"ok":true}']),
        'Saved "Renew visa" for next Saturday. I\'ll remind you that morning.',
      ),
    ).toEqual([]);
    expect(codes(ctx(noon, ["got my project done last night", "take that back"]), "Okay, taken back. What's on your mind?")).toContain("claims_change");
  });
  it("never shows a record's id", () => {
    expect(codes(ctx(noon, ["what do you know about me"]), "I have this one: [3f2c1a90-7b1e-4c55-9a0e-1d2f3a4b5c6d] you like mornings.")).toContain(
      "internal_id",
    );
  });
});

describe("answer checks: the owner's standard (his grades of 2026-11-26)", () => {
  const briefing: Call[] = [["get_daily_briefing", {}]];
  it("a quick message gets a quick answer", () => {
    const long =
      "You are already in a study block right now and it runs for a while, and all three of the assignments for tonight are due at the same time, so use this hour on the first homework, then the quiz block starts after that, and then there is the discussion post that has been overdue for a long while now, which I can slot in for thirty minutes after your last block ends tonight if that works for you and your evening.";
    expect(codes(ctx(noon, ["I have an hour free, what now?"], briefing, ['{"ok":true}']), long)).toContain("too_long");
    expect(
      codes(ctx(noon, ["I have an hour free, what now?"], briefing, ['{"ok":true}']), "Homework 8, it's due at 11:59 PM tonight. The chapter quiz is next."),
    ).toEqual([]);
  });
  it("no strict cap: real help, a breakdown or all of something may be as long as it needs", () => {
    expect(
      codes(
        ctx(noon, ["can you explain how compound interest works and how I should think about my savings"]),
        Array(14).fill("Compound interest means you earn on what you already earned.").join(" "),
      ),
    ).toEqual([]);
    const steps =
      "Eight steps, all saved: pick sources, read and note each one, find the threads, outline, draft the review, draft the methods, revise with your advisor, final pass. ".repeat(
        2,
      ) + "First is pick sources, Monday.";
    expect(
      codes(
        ctx(
          noon,
          ["my thesis feels huge, break it down for me"],
          [["create_tasks", { tasks: [{ title: "Pick sources", dueDate: "2026-11-23" }] }]],
          ['{"ok":true}'],
        ),
        steps,
      ),
    ).toEqual([]);
    expect(wordLimit("what's due this week?")).toBeNull();
    expect(wordLimit("how do I start saving")).toBeNull();
    expect(wordLimit("thanks")).toBe(60);
    // they wrote a lot themselves (a pasted list): the answer reports on it
    expect(wordLimit(Array(70).fill("essay").join(" "))).toBeNull();
    // someone who asked for detailed answers gets a higher ceiling, and a photo's read-back is not judged for length
    const eighty = Array(80).fill("word").join(" ");
    expect(codes({ ...ctx(noon, ["hey"]), quickLimit: 120 }, eighty)).toEqual([]);
    expect(codes({ ...ctx(noon, ["here"]), hasFiles: true }, eighty)).toEqual([]);
    expect(codes(ctx(noon, ["hey"]), eighty)).toEqual(["too_long"]);
  });
  it("after a promise: one line, then stop", () => {
    const promised: Call[] = [["make_promise", { text: "work on it", date: "2026-11-21", time: "21:00" }]];
    const said = ["I swear I'll work on it after dinner"];
    expect(
      codes(ctx(noon, said, promised, ['{"ok":true}']), "That's a promise. I'll check in tonight at 9 PM. Want me to block some study time for it?"),
    ).toContain("after_promise");
    expect(codes(ctx(noon, said, promised, ['{"ok":true}']), "That's a promise. I'll check in tonight at 9 PM.")).toEqual([]);
  });
  it("never asks what a look would answer", () => {
    expect(
      codes(ctx(noon, ["can you just do my midterm for me"]), "I can't do it for you, but I can help you prep. Which class is it, and when's the exam?"),
    ).toContain("asks_lookup");
    expect(
      codes(
        ctx(noon, ["can you just do my midterm for me"], [["list_assignments", {}]], ['{"ok":true}']),
        "I can't take it for you. Your BIO midterm is Thursday at 6 PM: want a study block before it?",
      ),
    ).toEqual([]);
  });
  it('it works here or it does not: never "try again in a bit"', () => {
    expect(
      codes(
        ctx(noon, ["find studies on video games"], [["web_search", { query: "x" }]], ['{"ok":true,"data":{"unavailable":"x"}}']),
        "I can't search the web right now. Want me to try again in a bit?",
      ),
    ).toContain("works_later");
  });
  it('no "items", and at most two questions', () => {
    expect(codes(ctx(noon, ["thanks, that helps"]), "You're welcome. Which of the three Sunday items is the one you've been putting off?")).toContain(
      "vague_word",
    );
    expect(codes(ctx(noon, ["how many items are on my list"], [["list_tasks", {}]], ["{}"]), "Four items, the lab report first.")).toEqual([]);
    expect(codes(ctx(noon, ["ugh"]), "Rough day? Want to talk it through? Or should I just show what's due?")).toContain("too_many_questions");
  });
});

describe("answer checks: what they never touch", () => {
  it("a reply to someone in real distress is never judged", () => {
    const stay =
      "I'm really glad you told me that, and I'm taking it seriously. Is there someone you trust who can be with you right now? You can call or text 988 any time, and if you're in danger call 911. How are you doing right now? Are you safe? Do you want to tell me more?";
    expect(codes(ctx(noon, ["I don't want to be here anymore"]), stay)).toEqual([]);
    expect(codes(ctx(noon, ["I don't want to be here anymore"]), "I'm really glad you told me that, and I'm taking it seriously.")).toEqual([]);
  });
  it("an answer in either acting-on-your-own mode passes when it does what its line says", () => {
    expect(MODE_LINES.on).toMatch(/Say what you saved and that it can be undone/);
    const saved: Call[] = [
      ["find_free_time", {}],
      ["create_events", { events: [{ title: "Study: BIO", date: "2026-11-21", startTime: "14:00", endTime: "15:00" }] }],
    ];
    expect(
      codes(ctx(noon, ["I'm so behind in BIO"], saved, ['{"ok":true}']), "I put a BIO study block at 2:00 PM today. Undo is right there if it doesn't fit."),
    ).toEqual([]);
    expect(
      codes(ctx(noon, ["I'm so behind in BIO"], [["find_free_time", {}]], ['{"ok":true}']), "You're free at 2:00 PM today. Want me to block an hour for BIO?"),
    ).toEqual([]);
  });
  it("the note sent back tells the model what to fix and never to mention the check", () => {
    const note = fixNote([
      { code: "works_later", note: "Do not say it will work later." },
      { code: "vague_word", note: "Name what they are." },
    ]);
    expect(note).toMatch(/was not shown to them/);
    expect(note).toMatch(/do not mention this check/);
    expect(note).toContain("- Do not say it will work later.");
    expect(note).not.toMatch(/—/);
  });
  it("every code is a short plain word group, safe to store on a run", () => {
    for (const c of CHECK_CODES) expect(c).toMatch(/^[a-z_]{4,24}$/);
    const all: CheckCode[] = [...CHECK_CODES];
    expect(new Set(all).size).toBe(all.length);
  });
});
