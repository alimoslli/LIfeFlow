/**
 * The email sent after a sign-in with an emailed code, so a sign-in the person didn't make doesn't go unnoticed. It says
 * so when that device is now remembered for 30 days (security review, 2026-11-14, F4).
 */
export function emailSignInNotice(remembered: boolean) {
  const lines = [
    "You just signed in to LifeFlow with a code we emailed you.",
    ...(remembered ? ["This device won't ask for a code for the next 30 days."] : []),
    remembered
      ? "If this wasn't you, change your password now. That also makes this device ask for a code again."
      : "If this wasn't you, change your password now.",
  ];
  return { subject: "You signed in to LifeFlow with an email code", text: lines.join(" "), html: lines.map((l) => `<p>${l}</p>`).join("") };
}
