/**
 * Today's note is about one thing on the day (a class, a shift, a delivery); a tap opens that thing's own card on the
 * line, not another page (test students, 2026-11-16: "Next: BIO 105 …" opened the Calendar's month grid). The note
 * carries `/?stop=<id>`; on Today it's a window event the day clock listens to, anywhere else a link that opens Today.
 */
export const SHOW_STOP = "lf:show-stop";

export const stopHref = (id: string) => `/?stop=${encodeURIComponent(id)}`;

/** The stop a note's link names, or null for any other link. */
export function stopOf(href: string | undefined | null): string | null {
  if (!href?.startsWith("/?stop=")) return null;
  return decodeURIComponent(href.slice("/?stop=".length));
}

/** Shows the stop on Today when the day clock is on the page; returns false when it isn't (then follow the link). */
export function showStop(href: string | undefined | null): boolean {
  const id = stopOf(href);
  if (!id || typeof window === "undefined" || !document.querySelector('[data-testid="day-clock"]')) return false;
  window.dispatchEvent(new CustomEvent(SHOW_STOP, { detail: id }));
  return true;
}
