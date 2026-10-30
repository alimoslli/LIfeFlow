import { describe, expect, it } from "vitest";
import { courseGrade, letterFor, neededOnFinal, parseScore } from "@/lib/grades";

describe("grades", () => {
  it("reads what students type", () => {
    expect(parseScore("45/50")).toBe(0.9);
    expect(parseScore("92%")).toBe(0.92);
    expect(parseScore("18", 20)).toBe(0.9);
    expect(parseScore("88")).toBe(0.88);
    expect(parseScore("a-")).toBe(0.915);
    expect(parseScore("pending")).toBeNull();
    expect(parseScore("")).toBeNull();
  });

  it("averages by points, or by the class weights", () => {
    const items = [
      { kind: "exam", grade: "70/100", pointsPossible: 100 },
      { kind: "assignment", grade: "19/20", pointsPossible: 20 },
      { kind: "assignment", grade: "20/20", pointsPossible: 20 },
      { kind: "quiz", grade: null, pointsPossible: 10 },
    ];
    expect(courseGrade(items)).toEqual({ percent: 77.9, letter: "C+", graded: 3, countedWeight: null });
    // Exams 50%, assignments 30%, quizzes 20% (no quiz grades yet): (0.5*70 + 0.3*97.5) / 0.8
    expect(courseGrade(items, { exam: 50, assignment: 30, quiz: 20 })).toEqual({ percent: 80.3, letter: "B-", graded: 3, countedWeight: 80 });
    expect(courseGrade([{ kind: "exam", grade: null, pointsPossible: null }])).toBeNull();
  });

  it("works out what's needed on the final", () => {
    expect(neededOnFinal(85, 25, 90)).toBe(105);
    expect(neededOnFinal(85, 25, 80)).toBe(65);
    expect(neededOnFinal(85, 0, 90)).toBeNull();
    expect(letterFor(92.9)).toBe("A-");
  });
});
