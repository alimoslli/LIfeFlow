import { describe, expect, it } from "vitest";
import { lifeAreas, starterIdeas } from "@/lib/life";

describe("life areas", () => {
  it("shows only what fills the user's week; unknown shows everything", () => {
    expect(lifeAreas("student")).toEqual({ school: true, work: false });
    expect(lifeAreas("working")).toEqual({ school: false, work: true });
    expect(lifeAreas("both")).toEqual({ school: true, work: true });
    expect(lifeAreas("life")).toEqual({ school: false, work: false });
    expect(lifeAreas(undefined)).toEqual({ school: true, work: true });
  });

  it("offers three starter ideas that fit", () => {
    expect(starterIdeas("student")[0]).toMatch(/syllabus/);
    expect(starterIdeas("working")[1]).toMatch(/shifts/);
    expect(starterIdeas("life").join(" ")).not.toMatch(/syllabus|shifts/);
    for (const s of ["student", "working", "both", "life"] as const) expect(starterIdeas(s)).toHaveLength(3);
  });
});
