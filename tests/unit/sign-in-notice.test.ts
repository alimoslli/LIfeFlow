import { describe, expect, it } from "vitest";
import { emailSignInNotice } from "@/lib/sign-in-notice";

// security review, 2026-11-14 (F4): the notice after an emailed-code sign-in says when that device is now remembered
describe("the email after a sign-in with an emailed code", () => {
  it("says the device is remembered for 30 days, and how to undo it, when it was", () => {
    const n = emailSignInNotice(true);
    expect(n.text).toContain("This device won't ask for a code for the next 30 days.");
    expect(n.text).toContain("change your password now. That also makes this device ask for a code again.");
    expect(n.html).toContain("<p>This device won't ask for a code for the next 30 days.</p>");
  });
  it("says nothing about remembering when it wasn't", () => {
    const n = emailSignInNotice(false);
    expect(n.text).not.toMatch(/30 days|remember/i);
    expect(n.text).toContain("If this wasn't you, change your password now.");
  });
  it("keeps the house style: no dashes, no internal words", () => {
    for (const n of [emailSignInNotice(true), emailSignInNotice(false)])
      for (const t of [n.subject, n.text]) expect(t).not.toMatch(/[—–]|assistant|cookie|token|session/i);
  });
});
