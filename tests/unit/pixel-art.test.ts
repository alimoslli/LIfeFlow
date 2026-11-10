import { describe, expect, it } from "vitest";
import { COLOR, MONO, PIXEL_PALETTE, SOFT } from "@/components/pixel/art";
import { cloudStyle } from "@/components/skylings/cloud-tile";

describe("our pixel icons", () => {
  const all = { ...COLOR, ...MONO, ...Object.fromEntries(Object.entries(SOFT).map(([k, v]) => [`soft:${k}`, v as readonly string[]])) };

  it("are all 16 by 16, in colours the palette knows", () => {
    for (const [name, rows] of Object.entries(all)) {
      expect(rows, name).toHaveLength(16);
      for (const row of rows) {
        expect(row.length, `${name}: "${row}"`).toBe(16);
        for (const ch of row) if (ch !== "." && !(name in MONO)) expect(PIXEL_PALETTE[ch], `${name}: "${ch}"`).toBeDefined();
      }
    }
  });

  it("colour icons carry an ink outline and one-colour icons only their one colour", () => {
    for (const [name, rows] of Object.entries(COLOR)) expect(rows.join("").includes("k"), name).toBe(true);
    for (const [name, rows] of Object.entries(MONO)) expect(new Set(rows.join("").replace(/\./g, "")), name).toEqual(new Set(["x"]));
  });

  it("the tabs, pills and bars have their icons", () => {
    for (const name of [
      "today",
      "money",
      "school",
      "calendar",
      "todo",
      "goal",
      "health",
      "shift",
      "chat",
      "bell",
      "idea",
      "person",
      "bill",
      "card",
      "class",
      "pencil",
      "note",
      "cog",
      "find",
    ])
      expect(COLOR[name as keyof typeof COLOR], name).toBeDefined();
    for (const name of ["send", "voice", "plus", "close", "back"]) expect(MONO[name as keyof typeof MONO], name).toBeDefined();
  });
});

describe("the idea clouds' drawing", () => {
  it("has three shapes that take turns, each by day and at night", () => {
    const [a, b, c, again] = [0, 1, 2, 3].map(cloudStyle);
    expect(again).toBe(a);
    expect(new Set([a["--cloud-day"], b["--cloud-day"], c["--cloud-day"]]).size).toBe(3);
    for (const s of [a, b, c]) {
      expect(s["--cloud-day"]).toMatch(/^url\("data:image\/svg\+xml,/);
      expect(s["--cloud-night"]).not.toBe(s["--cloud-day"]);
      expect(s["--cloud-slice"]).toMatch(/^9 \d+ 5 \d+ fill$/);
    }
  });

  it("keeps a flat stretch between the puffs so the middle can stretch cleanly", () => {
    for (const s of [0, 1, 2].map(cloudStyle)) {
      const [, right, , left] = s["--cloud-slice"].split(" ").map(Number);
      expect(left + right).toBeLessThan(48);
    }
  });
});
