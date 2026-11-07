import type { ZodIssue } from "zod";

/** Plain names for the form fields people see. Anything not listed gets a generic sentence. */
const LABELS: Record<string, string> = {
  netCents: "net pay",
  grossCents: "gross pay",
  hours: "hours",
  payDate: "pay date",
  date: "date",
  startTime: "start time",
  endTime: "end time",
  breakMinutes: "break",
  name: "name",
  title: "title",
  email: "email",
  hourlyRateCents: "hourly rate",
  employerId: "job",
  amountCents: "amount",
  notes: "notes",
};

/** Zod's own wording ("Too small: expected number to be >=0", "Invalid input: …"). Anything else was written for people. */
const LIBRARY_WORDING = /^(invalid|too (small|big)|expected|required|unrecognized|number must|string must|array must)\b|expected .+ received|>=|<=/i;

/** One validation problem as a plain sentence: no field names, no library wording. */
export function plainIssue(i: Pick<ZodIssue, "code" | "path" | "message"> & Record<string, unknown>): string {
  const key = i.path.length ? String(i.path.at(-1)) : "";
  const label = LABELS[key];
  const the = label ? `the ${label}` : "this field";
  const This = label ? `${label[0].toUpperCase()}${label.slice(1)}` : "This field";
  const min = typeof i.minimum === "number" || typeof i.minimum === "bigint" ? Number(i.minimum) : undefined;
  const max = typeof i.maximum === "number" || typeof i.maximum === "bigint" ? Number(i.maximum) : undefined;
  const money = key.endsWith("Cents");
  const show = (n: number) => (money ? `$${(n / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}` : String(n));
  const noun = money ? "an amount" : "a number";
  const code = String(i.code);
  // A message the schema wrote for people (e.g. "Give the to-do a title.") is already plain: keep it.
  if (typeof i.message === "string" && i.message && !LIBRARY_WORDING.test(i.message)) return i.message;

  switch (code) {
    case "too_small":
      if (i.origin === "string" || i.origin === "array") return min != null && min <= 1 ? `${This} is required.` : `${This} is too short.`;
      return min != null ? `Enter ${noun} of ${show(min)} or more${label ? ` for ${the}` : ""}.` : `${This} is too small.`;
    case "too_big":
      if (i.origin === "string" || i.origin === "array") return `${This} is too long.`;
      return max != null ? `Enter ${noun} of ${show(max)} or less${label ? ` for ${the}` : ""}.` : `${This} is too big.`;
    case "invalid_type":
      return /received undefined/.test(i.message) ? `${This} is required.` : `${This} isn't in the right form. Check it and try again.`;
    case "invalid_format":
    case "invalid_string":
      return `${This} isn't in the right format. Check it and try again.`;
    case "invalid_value":
      return `Pick one of the choices for ${the}.`;
    default:
      return label ? `Check ${the} and try again.` : "Check what you entered and try again.";
  }
}

export function plainValidation(issues: readonly ZodIssue[]): string {
  return plainIssue(issues[0] as never);
}
