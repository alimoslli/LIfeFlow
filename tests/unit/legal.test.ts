import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { legalDetails } from "@/lib/legal";

describe("legal pages", () => {
  it.each(["src/app/(legal)/privacy/page.tsx", "src/app/(legal)/terms/page.tsx", "src/lib/legal.ts"])("%s has no em or en dashes", (f) => {
    expect(readFileSync(f, "utf8")).not.toMatch(/[—–]/);
  });

  it("uses neutral wording until the operator details are configured, never invented ones", () => {
    expect(legalDetails({})).toMatchObject({ email: null, configured: false, operator: "an individual developer based in the United States" });
    expect(legalDetails({ LEGAL_OPERATOR_NAME: "Jane Doe", LEGAL_CONTACT_EMAIL: "hello@example.com", LEGAL_STATE: "Texas" })).toEqual({
      operator: "Jane Doe",
      email: "hello@example.com",
      jurisdiction: "the State of Texas, United States",
      configured: true,
    });
    expect(legalDetails({ LEGAL_CONTACT_EMAIL: "not an email" }).email).toBeNull();
  });
});
