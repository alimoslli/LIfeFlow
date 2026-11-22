/**
 * The hyperfocus check-in (owner, 2026-11-22, the ADHD helps, item 4): only inside a focus session the person started
 * (a real record of when they began), never from a guess that they're working. Said once in a calm line, never an alarm.
 */

/** How far past the planned time before the screen says how long it's been. */
export const OVER_BY_MINUTES = 20;

export type FocusNext = { title: string; at: string; clock: string } | null;

export function focusCheck(o: { startedAt: number; plannedMinutes: number; now: number; next: FocusNext; headsUp: number }): string | null {
  const elapsed = Math.floor((o.now - o.startedAt) / 60_000);
  if (o.next && o.headsUp > 0) {
    const at = Date.parse(o.next.at);
    if (o.now >= at) return `${o.next.title} has started (${o.next.clock}).`;
    if (o.now >= at - o.headsUp * 60_000) return `${o.next.title} is at ${o.next.clock}. Want to wrap up?`;
  }
  if (elapsed >= o.plannedMinutes + OVER_BY_MINUTES) return `It's been ${elapsed} minutes. A short break?`;
  return null;
}

/** "4:59" from milliseconds left (never below 0:00). */
export function clockLeft(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "12:03" since a session with no set end began. */
export function clockUp(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
