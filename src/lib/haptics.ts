/**
 * Haptic-style feedback. Android browsers vibrate; iPhones don't expose
 * vibration to web apps, so there the visual micro-animation is the feedback.
 */
const PATTERNS: Record<"light" | "medium" | "success" | "warning", number | number[]> = { light: 8, medium: 14, success: [10, 40, 14], warning: [18, 60, 18] };

/**
 * Vibrates, but only once the person has tapped the page: browsers block it before that and log "Blocked call to
 * navigator.vibrate" (a celebration on page load did).
 */
export function vibrate(pattern: number | number[]) {
  try {
    if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    navigator.vibrate(pattern);
  } catch {}
}

export function haptic(kind: keyof typeof PATTERNS = "light") {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  } catch {
    return;
  }
  vibrate(PATTERNS[kind]);
}
