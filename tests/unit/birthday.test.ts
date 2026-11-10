import { describe, expect, it } from "vitest";
import { ageOn, birthDateProblem, MIN_AGE } from "@/lib/birthday";

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
  });
});
