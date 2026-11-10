import { describe, expect, it } from "vitest";
import { ageOn, birthDateProblem, isUnderAge, MIN_AGE } from "@/lib/birthday";

describe("birthday (the welcome, Settings › Profile)", () => {
  it("counts whole years, the day of the birthday included", () => {
    expect(ageOn("2005-04-12", "2026-04-11")).toBe(20);
    expect(ageOn("2005-04-12", "2026-04-12")).toBe(21);
    expect(ageOn("2004-02-29", "2026-02-28")).toBe(21);
  });

  it("is fine for 13 and up, and says why otherwise, in plain words", () => {
    expect(MIN_AGE).toBe(13);
    expect(birthDateProblem("2013-11-10", "2026-11-10")).toBeNull();
    expect(birthDateProblem("2013-11-11", "2026-11-10")).toBe("LifeFlow is for people 13 and older.");
    expect(birthDateProblem("2027-01-01", "2026-11-10")).toBe("That day hasn't happened yet.");
    expect(birthDateProblem("1890-01-01", "2026-11-10")).toBe("Check the year.");
    expect(birthDateProblem("not a date", "2026-11-10")).toBe("Pick your birthday.");
    // a real day only (it used to roll "2010-02-31" over to March 3)
    expect(birthDateProblem("2010-02-31", "2026-11-10")).toBe("Pick your birthday.");
    expect(birthDateProblem("2009-02-29", "2026-11-10")).toBe("Pick your birthday.");
    expect(birthDateProblem("2008-02-29", "2026-11-10")).toBeNull();
  });

  it("treats an impossible age as a slip, never as an answer: today's date from a phone's picker can't lock anyone", () => {
    for (const slip of ["2026-11-10", "2025-06-01", "2022-11-11"]) {
      expect(birthDateProblem(slip, "2026-11-10")).toBe("Check the year.");
      expect(isUnderAge(slip, "2026-11-10")).toBe(false);
    }
    // five and up is a real answer
    expect(isUnderAge("2021-11-10", "2026-11-10")).toBe(true);
    expect(isUnderAge("2015-03-03", "2026-11-10")).toBe(true);
  });
});
