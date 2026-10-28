/**
 * Haptic-style feedback. Android browsers vibrate; iPhones don't expose
 * vibration to web apps, so there the visual micro-animation is the feedback.
 */
const PATTERNS: Record<"light" | "medium" | "success" | "warning", number | number[]> = { light: 8, medium: 14, success: [10, 40, 14], warning: [18, 60, 18] };

export function haptic(kind: keyof typeof PATTERNS = "light") {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      navigator.vibrate(PATTERNS[kind]);
  } catch {}
}
