import { describe, expect, it } from "vitest";
import { isSchoolAddress, NAMED_SCHOOL_DOMAINS } from "@/lib/school-domains";

describe("who counts as a school address", () => {
  it.each([
    "a@mit.edu",
    "a@cs.stanford.edu",
    "a@unsw.edu.au",
    "a@ox.ac.uk",
    "a@auckland.ac.nz",
    "A@Mit.EDU",
    `a@${NAMED_SCHOOL_DOMAINS[0]}`,
    `a@mail.${NAMED_SCHOOL_DOMAINS[0]}`,
  ])("accepts %s", (a) => expect(isSchoolAddress(a)).toBe(true));
  it.each([
    "a@gmail.com",
    "a@school.edu.evil.com",
    "a@edu.com",
    "a@notedu.com",
    "a@evil-utoronto.ca",
    "a b@mit.edu",
    "a@mit .edu",
    "a@mit.edu ",
    "a@@mit.edu",
    "a@mit",
    "@mit.edu",
    "a@.edu",
    "a@mit.edu.",
    "a@x.edu.com",
    "a@x.ac.uk.evil.com",
  ])("refuses %j", (a) => expect(isSchoolAddress(a)).toBe(false));
});
