const NOT_NAMES = new Set(["admin", "info", "test", "tester", "qa", "user", "mail", "hello", "contact", "support", "team", "me", "noreply", "demo"]);

/**
 * A readable stand-in name from the email's first part ("jordan.lee7@x.com" becomes "Jordan"), used until the person says what to call them.
 * Only a first word made of letters counts ("jdoe1234@x.com" and "qa@x.com" give "there", so nobody is greeted as "Jdoe1234").
 */
export function provisionalName(email: string): string {
  const first = (email.split("@")[0] ?? "").split(/[._\-+]+/)[0] ?? "";
  if (!/^[a-zA-Z]{2,}$/.test(first) || NOT_NAMES.has(first.toLowerCase())) return "there";
  return first[0].toUpperCase() + first.slice(1).toLowerCase();
}
