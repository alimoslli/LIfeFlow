import { describe, expect, it } from "vitest";
import { adminEmails, isAdminEmail } from "@/server/auth/admin";
import { likePattern } from "@/server/services/admin";

describe("admin allow-list", () => {
  it("parses ADMIN_EMAILS: trims, lowercases, ignores blanks", () => {
    expect(adminEmails({ ADMIN_EMAILS: " Owner@Example.com , ,second@x.io " })).toEqual(["owner@example.com", "second@x.io"]);
  });
  it("is empty when the variable is missing, so nobody is an admin", () => {
    expect(adminEmails({})).toEqual([]);
    expect(isAdminEmail("anyone@x.io", {})).toBe(false);
  });
  it("matches regardless of case and spaces, and nothing else", () => {
    const env = { ADMIN_EMAILS: "owner@example.com" };
    expect(isAdminEmail(" OWNER@example.com ", env)).toBe(true);
    expect(isAdminEmail("owner@example.com.evil.io", env)).toBe(false);
    expect(isAdminEmail("xowner@example.com", env)).toBe(false);
  });
});

describe("user search pattern", () => {
  it("escapes LIKE wildcards so '50%' or '_' can't match everything", () => {
    expect(likePattern("50%")).toBe("%50\\%%");
    expect(likePattern("a_b")).toBe("%a\\_b%");
    expect(likePattern("back\\slash")).toBe("%back\\\\slash%");
  });
});
