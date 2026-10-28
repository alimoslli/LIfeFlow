import { describe, expect, it } from "vitest";
import { selectMemories, stem, type RetrievableMemory } from "@/server/jarvis/memory-retrieval";
import type { MemoryCategory } from "@/server/db/schema";

const at = new Date("2026-10-01T00:00:00Z");
const mem = (id: string, category: MemoryCategory, content: string): RetrievableMemory => ({
  id,
  category,
  content,
  basis: "stated",
  updatedAt: at,
  lastUsedAt: null,
});

const M = [
  mem("study", "preference", "Prefers studying in the morning."),
  mem("job", "routine", "Works at the Campus Library, usually Tue/Thu evenings and Saturday mornings."),
  mem("trip", "goal", "Saving for a summer trip to Montréal."),
  mem("food$", "goal", "Wants to keep food spending under $450 a month."),
  mem("car", "routine", "Has a car; drives to campus on Mondays and takes the bus other days."),
  mem("dollars", "instruction", "Show amounts in whole dollars."),
  mem("midterms", "temporary", "Midterm season: extra stressed until mid-November."),
  mem("veg", "fact", "Is vegetarian."),
  mem("bday", "fact", "Sister Maya's birthday is May 3."),
  mem("peanut", "fact", "Allergic to peanuts."),
  mem("lab", "fact", "Biology II lab partner is Jordan."),
  mem("rent", "fact", "Rent is $900, due on the 1st."),
];

/** Labelled cases: what must reach the model, and what must not. */
const CASES: { q: string; recent?: string[]; must: string[]; never: string[] }[] = [
  { q: "When should I study for my bio exam this week?", must: ["study", "job", "midterms"], never: ["veg", "bday", "peanut", "rent"] },
  { q: "Can I afford a $100 concert this weekend?", must: ["trip", "food$", "rent"], never: ["veg", "bday", "peanut", "lab"] },
  { q: "Any cheap dinner ideas?", must: ["veg", "peanut", "food$"], never: ["job", "car", "bday", "lab"] },
  { q: "What's my sister's birthday?", must: ["bday"], never: ["study", "job", "trip", "food$", "car", "veg", "peanut", "lab", "rent", "midterms"] },
  { q: "How do I get to campus on Monday?", must: ["car"], never: ["veg", "peanut", "rent", "bday"] },
  { q: "hi", must: [], never: ["study", "job", "trip", "food$", "car", "midterms", "veg", "bday", "peanut", "lab", "rent"] },
  { q: "what about next weekend?", recent: ["Can I afford a $100 concert this weekend?"], must: ["trip", "food$"], never: ["veg", "bday", "peanut", "lab"] },
  { q: "Who's my lab partner?", must: ["lab"], never: ["trip", "food$", "rent", "veg", "peanut"] },
  { q: "Plan my week", must: ["study", "job", "car"], never: ["veg", "peanut", "rent", "bday"] },
  { q: "I'm so stressed about midterms", must: ["midterms"], never: ["rent", "veg", "trip"] },
  { q: "How much did I spend on groceries?", must: ["food$"], never: ["bday", "lab", "car"] },
];

describe("memory retrieval", () => {
  it("stems common forms to the same root", () => {
    expect(new Set(["study", "studying", "studied", "studies"].map(stem)).size).toBe(1);
    expect(new Set(["save", "saving", "saved"].map(stem)).size).toBe(1);
    expect(new Set(["shift", "shifts"].map(stem)).size).toBe(1);
    expect(stem("thursday")).toBe("thu");
  });

  it.each(CASES)("$q", ({ q, recent, must, never }) => {
    const ids = selectMemories(M, { text: q, recent }).map((m) => m.id);
    expect(ids).toContain("dollars"); // standing instructions always apply
    for (const id of must) expect(ids, `expected "${id}" for "${q}" (got ${ids.join(", ")})`).toContain(id);
    for (const id of never) expect(ids, `did not expect "${id}" for "${q}"`).not.toContain(id);
  });

  it("meets the recall/precision baseline across the labelled set", () => {
    let hit = 0;
    let need = 0;
    let wrong = 0;
    let forbidden = 0;
    for (const c of CASES) {
      const ids = new Set(selectMemories(M, { text: c.q, recent: c.recent }).map((m) => m.id));
      need += c.must.length;
      hit += c.must.filter((id) => ids.has(id)).length;
      forbidden += c.never.length;
      wrong += c.never.filter((id) => ids.has(id)).length;
    }
    expect(hit / need).toBe(1);
    expect(wrong / forbidden).toBe(0);
  });

  it("sends fewer memories than it has, within the size budget", () => {
    const many = Array.from({ length: 200 }, (_, i) => mem(`m${i}`, "fact", `Note ${i} about budget item number ${i} costing money.`));
    const picked = selectMemories(many, { text: "how is my budget" }, { limit: 12, maxChars: 2400 });
    expect(picked.length).toBeLessThanOrEqual(12);
    expect(picked.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(2400);
  });
});
