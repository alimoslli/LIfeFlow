import { describe, expect, it } from "vitest";
import { selectMemories, stem } from "@/server/jarvis/memory-retrieval";
import { CASES, M, mem } from "../fixtures/memory-cases";

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

  // local models (docs/backlog/2026-11-12-local-models.md): meaning only ever adds, and nothing changes without it
  it("with meaning scores, a memory close in meaning comes along with no shared word; without them, nothing changes", () => {
    const q = { text: "What should I make for dinner tonight?" };
    const plain = selectMemories(M, q).map((m) => m.id);
    expect(selectMemories(M, q, { meaning: new Map() }).map((m) => m.id)).toEqual(plain);
    const meant = selectMemories(M, q, {
      meaning: new Map([
        ["veg", 0.5],
        ["bday", 0.1],
      ]),
    }).map((m) => m.id);
    expect(meant).toContain("veg");
    expect(meant).not.toContain("bday");
  });

  it("meaning below the bar never adds a memory, and instructions still always come", () => {
    const ids = selectMemories(M, { text: "hi" }, { meaning: new Map(M.map((m) => [m.id, 0.29])) }).map((m) => m.id);
    expect(ids).toEqual(["dollars"]);
  });

  it("sends fewer memories than it has, within the size budget", () => {
    const many = Array.from({ length: 200 }, (_, i) => mem(`m${i}`, "fact", `Note ${i} about budget item number ${i} costing money.`));
    const picked = selectMemories(many, { text: "how is my budget" }, { limit: 12, maxChars: 2400 });
    expect(picked.length).toBeLessThanOrEqual(12);
    expect(picked.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(2400);
  });
});
