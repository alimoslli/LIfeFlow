import { clsx, type ClassValue } from "clsx";

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

/** Lowercase, strip punctuation and collapse whitespace — for fuzzy matching and dedupe keys. */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function truncate(s: string, n: number) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** "Tue/Thu 13:00–14:15" → "Tue/Thu 1:00–2:15 PM": 24-hour time ranges in free text, shown the way the rest of the app does. */
export function twelveHourRanges(text: string) {
  const h12 = (h: number, m: string) => `${h % 12 || 12}:${m}`;
  return text.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\s*[–-]\s*([01]?\d|2[0-3]):([0-5]\d)\b(?!\s*[ap]\.?m)/gi, (_, a, am, b, bm) => {
    const [s, e] = [Number(a), Number(b)];
    const [sp, ep] = [s < 12 ? "AM" : "PM", e < 12 ? "AM" : "PM"];
    return sp === ep ? `${h12(s, am)}–${h12(e, bm)} ${ep}` : `${h12(s, am)} ${sp}–${h12(e, bm)} ${ep}`;
  });
}
