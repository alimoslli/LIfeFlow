import { describe, expect, it } from "vitest";
import { bareCode, courseLabel, examLabel } from "@/lib/course-label";
import { composeMessage } from "@/lib/jarvis-voice";

describe("a class is named by something a person can read (owner, 2026-11-12)", () => {
  it("never uses a bare number", () => {
    expect(bareCode("23543")).toBe(true);
    expect(bareCode("2-3-5-4-3")).toBe(true);
    expect(bareCode("BIO 110")).toBe(false);
    expect(courseLabel({ code: "23543", name: "Ethics" })).toBe("Ethics");
    expect(courseLabel({ code: null, name: "23543" })).toBeNull();
    expect(courseLabel({ code: "PHIL 2306", name: "Ethics" })).toBe("PHIL 2306");
    expect(courseLabel({ code: null, name: "Ethics" })).toBe("Ethics");
  });

  it("an exam of a numbered class goes by its own title", () => {
    expect(examLabel(null, "exam", "Exam 2")).toBe("Exam 2");
    expect(examLabel("Ethics", "exam", "Exam 2")).toBe("Ethics exam");
  });

  it("the study card, new and already saved, never says the number", () => {
    const saved = { course: "23543", kind: "exam", exam: "Exam 2", examDay: "Sunday", minutes: 90, blockWhen: "Saturday at 2 PM" };
    const v = composeMessage("exam_study", saved, "direct");
    expect(`${v.title} ${v.body}`).not.toContain("23543");
    expect(v.title).toBe("Exam 2 Sunday");
    expect(v.body).toContain("Your Exam 2 is Sunday, and nothing is booked to study for it yet.");
    const named = composeMessage("exam_study", { ...saved, course: "Ethics", what: "Ethics exam" }, "direct");
    expect(named.title).toBe("Ethics exam Sunday");
  });
});
