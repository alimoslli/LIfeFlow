import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The verify page after "Email me a code" was sent: the second useActionState (the email form) holds the sent state.
vi.mock("react", async (orig) => {
  const real = await orig<typeof import("react")>();
  let call = 0;
  return {
    ...real,
    useActionState: (fn: unknown, initial: unknown) => {
      call++;
      return [call % 2 === 0 ? { sentTo: "a***@example.com" } : initial, fn, false];
    },
  };
});
vi.mock("@/app/(auth)/actions", () => ({ verifyLogin: async () => null, sendLoginEmailCode: async () => null }));

const { VerifyForm } = await import("@/app/(auth)/login/verify/verify-form");

describe("the verify page", () => {
  // owner, 2026-11-14 (choice A): the box shows, ticked, after an emailed code too
  it("offers 'Remember this phone for 30 days' after an emailed code", () => {
    const html = renderToStaticMarkup(createElement(VerifyForm, { emailAvailable: true }));
    expect(html).toContain("We emailed a 6-digit code to a***@example.com");
    expect(html).toMatch(/<input type="checkbox"[^>]*name="remember"[^>]*checked/);
    expect(html).toContain("Remember this phone for 30 days");
  });
});
