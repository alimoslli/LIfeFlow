import { describe, expect, it } from "vitest";
import { chooseEffort } from "@/server/jarvis/effort";
import { ALL_TOOLS, toolSpecs, toolSpecsFor } from "@/server/jarvis/registry";
import { routeSkills, SKILLS } from "@/server/jarvis/skills";
import { GROUP_TOOLS, groupOf, TOOL_GROUPS } from "@/server/jarvis/tool-groups";
import { selectToolGroups } from "@/server/jarvis/tool-select";
import type { ChatItem } from "@/server/jarvis/providers/types";

const size = (specs: { name: string }[]) => JSON.stringify(specs).length;
const pick = (text: string, opts: { module?: string; history?: ChatItem[] } = {}) =>
  selectToolGroups({ text, module: opts.module, skills: routeSkills(text, opts.module), history: opts.history ?? [{ type: "user", text }] });

describe("tool groups", () => {
  it("puts every tool in exactly one group, and names only real tools", () => {
    const listed = Object.values(GROUP_TOOLS).flat();
    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual(ALL_TOOLS.map((t) => t.name).sort());
  });

  it("keeps the always-on core small (most of the cost is in the other groups)", () => {
    expect(size(toolSpecsFor([]))).toBeLessThan(size(toolSpecs()) * 0.2);
  });

  it("every skill's tools belong to a group", () => {
    for (const s of SKILLS) for (const t of s.tools) expect(groupOf(t), `${s.name}: ${t}`).toBeDefined();
  });

  it("gives the same groups the same tools in the same order (so the prompt cache hits)", () => {
    const a = toolSpecsFor(["money", "school"]).map((t) => t.name);
    const b = toolSpecsFor(["school", "money", "core"]).map((t) => t.name);
    expect(a).toEqual(b);
    expect(a.slice(0, GROUP_TOOLS.core.length)).toEqual(GROUP_TOOLS.core);
  });
});

describe("picking tool groups for a request", () => {
  it("adds only what the message is about", () => {
    expect(pick("how much did I spend on food?")).toEqual(["core", "money"]);
    expect(pick("when is my BIO exam?")).toEqual(expect.arrayContaining(["core", "school"]));
    expect(pick("when is my BIO exam?")).not.toContain("money");
    expect(pick("log my workout")).toContain("health");
    expect(pick("email my professor about the extension")).toEqual(expect.arrayContaining(["email", "school"]));
  });

  it("uses the page Jarvis was opened from", () => {
    expect(pick("hi", { module: "finances" })).toEqual(["core", "money", "savings"]);
  });

  it("gives a plain greeting the schedule, the most common next question", () => {
    expect(pick("hi")).toEqual(["core", "calendar"]);
  });

  it("keeps what the chat already used, including groups it loaded", () => {
    const history: ChatItem[] = [
      { type: "user", text: "how's my week" },
      { type: "tool_call", callId: "c1", name: "work_earnings", arguments: "{}" },
      { type: "tool_result", callId: "c1", output: "{}" },
      { type: "tool_call", callId: "c2", name: "load_tools", arguments: '{"groups":["habits"]}' },
      { type: "tool_result", callId: "c2", output: "{}" },
      { type: "user", text: "ok thanks" },
    ];
    expect(pick("ok thanks", { history })).toEqual(expect.arrayContaining(["work", "habits"]));
  });

  it("sends everything when a file or photo is attached", () => {
    const history: ChatItem[] = [{ type: "user", text: "here", files: [{ filename: "syllabus.pdf", mimeType: "application/pdf", base64: "JVBERi0=" }] }];
    expect(pick("here", { history })).toEqual([...TOOL_GROUPS]);
  });
});

describe("auto thinking level", () => {
  const effort = (text: string, hasFiles = false) => chooseEffort({ text, skills: routeSkills(text), hasFiles, coachMode: false });

  it("keeps quick lookups and adds fast", () => {
    expect(effort("add a to-do to call mom")).toBe("low");
    expect(effort("what's due this week?")).toBe("low");
    expect(effort("how many hours am I working this week?")).toBe("low");
  });

  it("thinks more for advice, decisions and plans", () => {
    expect(effort("can I afford a $60 concert ticket?")).toBe("medium");
    expect(effort("should I pick up an extra shift or study?")).toBe("medium");
    expect(effort("plan my day")).toBe("medium");
    expect(effort("am I on track for my savings goal?")).toBe("medium");
    expect(effort("find me 2 hours to study before Thursday")).toBe("medium");
  });

  // owner's yes, 2026-11-12: plain lookups go to the small model, money never does (the COO's rule after the paid try-out)
  it("sends plain read-only lookups to the small model, even under a planning skill", () => {
    for (const q of [
      "What do I need to get done today?",
      "Which day this week is going to be the hardest?",
      "Do I have anything overdue?",
      "What's due this week?",
      "When is my BIO exam?",
      "How many hours am I working this week?",
      "Am I free Thursday afternoon?",
      // times, dates and counts are not amounts
      "Am I free at 10?",
      "Do I have class at 10:30?",
      "What's due on the 15th?",
      "What do I have on 11/20?",
      "When is my 10 page essay due?",
      "What's due in 14 days?",
      "What's my schedule tomorrow?",
    ])
      expect(effort(q), q).toBe("low");
  });

  it("never sends a money question to the small model", () => {
    for (const q of [
      "Can I afford to spend $60 this weekend?",
      "Where did my money go last month?",
      "What subscriptions am I paying for?",
      "When was the last time I Zelled Omar Mousselli?",
      "Am I on track for my savings goal?",
      "How many hours am I working this week and how much will I make?",
      "What's my balance?",
      "When is rent due?",
      "What did I spend on groceries?",
      "Do I have any bills this week?",
      "What did I buy at Target?",
      "How much is left in my checking?",
      "How much is in my savings?",
      // money said without a money word (COO review, 2026-11-12)
      "How do we split the pizza?",
      "What did we split last night?",
      "Is 40 too much for dinner?",
      "Can I do 200 this weekend?",
      "Is 12.50 ok for lunch?",
      "How much is 30 quid?",
      "How many bucks do I have?",
      "What's £20 for?",
      "What's €15 for?",
      "What's 25 euros in dollars?",
      "What's left this week?",
      "How much is left?",
      "What did I get at Target?",
      "Anything coming out this week?",
      "How much is my phone plan?",
      "Who owes me?",
      "What's my tip total?",
    ])
      expect(effort(q), q).not.toBe("low");
    // and a lookup that brings the money tools along is never low either, whatever its words
    expect(chooseEffort({ text: "what's new?", skills: [], hasFiles: false, coachMode: false, moneyTools: true })).toBe("medium");
  });

  it("thinks hardest for files and big plans", () => {
    expect(effort("add these", true)).toBe("high");
    expect(effort("make a study plan for the whole semester")).toBe("high");
  });
});
