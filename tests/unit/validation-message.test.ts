import { describe, expect, it } from "vitest";
import { z } from "zod";
import { plainValidation } from "@/lib/validation-message";

const say = (schema: z.ZodType, value: unknown) => {
  const r = schema.safeParse(value);
  if (r.success) throw new Error("expected a failure");
  return plainValidation(r.error.issues);
};

describe("validation messages are plain", () => {
  it("too small", () => {
    expect(say(z.object({ netCents: z.number().min(0) }), { netCents: -1 })).toBe("Enter an amount of $0 or more for the net pay.");
    expect(say(z.object({ x: z.number().min(3) }), { x: 1 })).toBe("Enter a number of 3 or more.");
    expect(say(z.object({ name: z.string().min(1) }), { name: "" })).toBe("Name is required.");
  });
  it("too big", () => {
    expect(say(z.object({ hourlyRateCents: z.number().max(1_000_000) }), { hourlyRateCents: 2_000_000 })).toBe(
      "Enter an amount of $10,000 or less for the hourly rate.",
    );
    expect(say(z.object({ title: z.string().max(3) }), { title: "long" })).toBe("Title is too long.");
  });
  it("required or wrong type", () => {
    expect(say(z.object({ payDate: z.string() }), {})).toBe("Pay date is required.");
    expect(say(z.object({ hours: z.number() }), { hours: "abc" })).toBe("Hours isn't in the right form. Check it and try again.");
  });
  it("bad format and choices", () => {
    expect(say(z.object({ email: z.string().email() }), { email: "nope" })).toBe("Email isn't in the right format. Check it and try again.");
    expect(say(z.object({ weird: z.enum(["a", "b"]) }), { weird: "c" })).toBe("Pick one of the choices for this field.");
  });
  it("never shows a raw field name or library wording", () => {
    const cases = [
      say(z.object({ netCents: z.number().min(0) }), { netCents: -1 }),
      say(z.object({ netCents: z.number() }), {}),
      say(z.object({ grossCents: z.number().max(5) }), { grossCents: 9 }),
      say(z.object({ someInternalField: z.number().min(0) }), { someInternalField: -1 }),
      say(z.object({ someInternalField: z.string() }), {}),
      say(z.object({ someInternalField: z.string().url() }), { someInternalField: "x" }),
    ];
    for (const c of cases) {
      expect(c).not.toMatch(/netCents|grossCents|someInternalField|expected|Cents|received|Invalid input/i);
    }
  });
});
