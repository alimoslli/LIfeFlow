/**
 * Reminders that don't get tuned out (owner, 2026-11-22, the ADHD helps, item 5; docs/backlog/2026-11-22-adhd-six.md):
 * the pushes we already send say the same facts in a few ways, and the next one for a person is never worded like the
 * last one of its kind. `turn` is how many of that kind they've had (services/push.ts `sentCount`), so turn and turn + 1
 * always pick different words. No guilt or pressure words, no em dashes (tests/unit/reminder-words.test.ts).
 */

const at = <T>(list: readonly T[], turn: number) => list[((turn % list.length) + list.length) % list.length];

/** `when` is "today", "at 3:00 PM" or "" (no due date). */
export function todoReminder(title: string, when: string, turn: number): { title: string; body: string } {
  if (!when) return { title, body: at(["Here's your reminder.", "Your reminder for this one.", "This is the reminder you set."], turn) };
  const clock = when.replace(/^at /, "");
  const today = when === "today";
  return {
    title,
    body: at(
      today
        ? ["Due today", "On your list for today", "Set for today. Ready when you are."]
        : [`Due ${when}`, `Set for ${clock}`, `Coming up at ${clock}. Ready when you are.`],
      turn,
    ),
  };
}

/** Several reminders at the same moment go out as one. */
export function todoGroup(titles: string[], turn: number): { title: string; body: string } {
  const n = titles.length;
  const shown = titles.slice(0, 2);
  const list = n <= 2 ? shown.join(" and ") : `${shown.join(", ")} and ${n - 2} more`;
  return { title: at([`${n} to-dos`, `${n} on your list`, `${n} reminders`], turn), body: list };
}

/** The heads-up before something starts (lib/heads-up.ts gives the facts). */
export function headsUpBody(minutes: number, place: string, turn: number): string {
  const m = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return at([`In ${m}${place}. Time to wrap up.`, `Starts in ${m}${place}. A good moment to finish up.`, `${m} to go${place}. Time to get ready.`], turn);
}

/** The star note's second half; the first wording is the owner's own ("Tap to claim your star on your sky."). */
export function starTail(many: boolean, turn: number): string {
  return many
    ? at(["Tap to claim them on your sky.", "Your stars are waiting on your sky.", "Come claim them on your sky."], turn)
    : at(["Tap to claim your star on your sky.", "Your star is waiting on your sky.", "Come claim your star on your sky."], turn);
}
