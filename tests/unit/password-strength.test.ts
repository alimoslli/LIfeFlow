import { describe, expect, it } from "vitest";
import { checkPassword } from "@/lib/password-strength";

describe("password strength", () => {
  it.each(["aaaaaaaaaa", "password123", "qwertyuiop", "1234567890", "iloveyou12", "Password1!"])("rejects the guessable %j", (pw) => {
    expect(checkPassword(pw).ok).toBe(false);
  });

  it("rejects passwords built from the user's own name or email", () => {
    expect(checkPassword("jordanlee2024", ["Jordan Lee", "jordan.lee@example.com"]).ok).toBe(false);
  });

  it("rejects anything under 10 characters, however random", () => {
    expect(checkPassword("x7#Lq9!z").ok).toBe(false);
  });

  it.each(["correct horse battery", "tangerine-violin-glacier-42", "K9#vT2!qLm8@pZ"])("accepts the strong %j", (pw) => {
    expect(checkPassword(pw)).toMatchObject({ ok: true });
  });

  it("explains what's wrong", () => {
    expect(checkPassword("password123").message).toMatch(/weak/i);
  });
});
