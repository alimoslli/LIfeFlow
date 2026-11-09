import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { knowsLine } from "@/lib/assistant";

const src = (p: string) => readFileSync(path.resolve(import.meta.dirname, "../../src", p), "utf8");
const EM_DASH = "—";

describe("copy that claims only what's true (audit A20)", () => {
  it("the empty chat says only what this account has", () => {
    expect(knowsLine([])).not.toMatch(/I know/);
    expect(knowsLine(undefined)).not.toMatch(/I know/);
    expect(knowsLine(["classes"])).toBe("I know your classes.");
    expect(knowsLine(["classes", "money"])).toBe("I know your classes and money.");
    expect(knowsLine(["classes", "shifts", "money"])).toBe("I know your classes, shifts and money.");
    expect(src("components/jarvis/chat.tsx")).not.toContain("I know your classes, shifts and money.");
  });

  it("the welcome never says it is connecting or reading anything it isn't", () => {
    // the demo day is gone (owner, 2026-11-09); the welcome only shows what the person really added
    const welcome = src("app/(onboarding)/welcome/onboarding.tsx");
    expect(welcome).not.toMatch(/Connecting your|Reading your/);
  });
});

describe("copy leftovers (audit A21)", () => {
  it("the tour doesn't offer accents (they were removed) and has no em dash", () => {
    const file = src("components/motion/tour.tsx");
    const tour = file.slice(file.indexOf("const steps = "), file.indexOf("const PAD"));
    expect(tour).toContain("Make it yours");
    expect(tour).not.toMatch(/accent/i);
    expect(tour).not.toContain(EM_DASH);
  });

  it("share titles use the tagline, without an em dash", () => {
    for (const file of ["app/layout.tsx", "app/landing/page.tsx"]) {
      const text = src(file);
      expect(text, file).not.toContain(EM_DASH);
      expect(text, file).not.toMatch(/made simple/);
    }
    expect(src("app/layout.tsx").match(/title: "LifeFlow: Your whole life, in flow\."/g)).toHaveLength(2);
  });
});
