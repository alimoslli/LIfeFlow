/**
 * Who may get the student price (owner, 2026-11-13, "A"): an address at a school domain. The one place to change it.
 * - any .edu, and .edu followed by a country code (.edu.au, .edu.sg);
 * - .ac.uk, and .ac followed by a country code (.ac.nz, .ac.jp);
 * - the named domains below (schools that don't use those endings). The owner can extend this list; a subdomain of a listed domain counts.
 * Next step ("C", later, not built): a student verification service from Apple or Stripe in place of this list.
 */
export const NAMED_SCHOOL_DOMAINS: readonly string[] = ["utoronto.ca", "ubc.ca", "mcgill.ca", "sfu.ca", "uwaterloo.ca", "ucl.ac.uk"];

const SCHOOL_ENDING = /(^|\.)(edu(\.[a-z]{2})?|ac\.[a-z]{2})$/;

/** True when the address (one @, no spaces) is at a school domain. Judged on the typed address only. */
export function isSchoolAddress(address: string): boolean {
  const email = address.toLowerCase(); // the caller trims what was typed; a space left in is refused
  const at = email.lastIndexOf("@");
  if (at < 1 || email.indexOf("@") !== at || /\s/.test(email)) return false;
  const domain = email.slice(at + 1);
  if (!/^[a-z0-9.-]+$/.test(domain) || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  if (!domain.includes(".")) return false;
  return SCHOOL_ENDING.test(domain) || NAMED_SCHOOL_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

export const NOT_SCHOOL_MESSAGE = "Use your school email address to get the student price.";
