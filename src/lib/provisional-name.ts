/** A readable stand-in name from the email's first part ("jordan.lee7@x.com" becomes "Jordan"), used until the person says what to call them. */
export function provisionalName(email: string): string {
  const first =
    email
      .split("@")[0]
      ?.split(/[^a-zA-Z]+/)
      .find((w) => w.length > 1) ?? "";
  return first ? first[0].toUpperCase() + first.slice(1).toLowerCase() : "there";
}
