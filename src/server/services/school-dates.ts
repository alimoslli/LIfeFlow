import type { WebAnswer } from "../integrations/web-search";

/**
 * Admin deadlines (owner, 2026-11-26, gamechanger 6): registration, financial aid and scholarship dates for the person's
 * school, found on the web. Every date keeps the page the search cited for it, a date without one is dropped, and none is
 * saved until they tick it (the skyling saves the ones they pick as to-dos). Never a guessed date.
 */
export const DATES_INSTRUCTIONS =
  "Find the official upcoming dates for this school: registration opening and deadlines, add/drop and withdrawal deadlines, tuition payment due dates, financial aid (FAFSA and the school's own) and scholarship deadlines. Use the school's own website or the official government site. Give only dates you found stated in a source, in YYYY-MM-DD form, each with the page it came from. Skip anything without an exact date.";

export const DATES_SCHEMA = {
  name: "school_dates",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["dates"],
    properties: {
      dates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["what", "date", "url"],
          properties: { what: { type: "string" }, date: { type: "string" }, url: { type: "string" } },
        },
      },
    },
  },
} as const;

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** Only real dates from today on, each from a page the search cited, one per thing, soonest first, at most 12. Pure. */
export function cleanDates(raw: unknown, cited: WebAnswer["sources"], today: string) {
  const r = (raw ?? {}) as { dates?: unknown };
  const out: { what: string; date: string; source: { title: string; url: string } }[] = [];
  for (const d of Array.isArray(r.dates) ? r.dates : []) {
    const { what, date, url } = (d ?? {}) as Record<string, unknown>;
    if (typeof what !== "string" || typeof date !== "string" || typeof url !== "string") continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || date < today) continue;
    const h = host(url);
    const hit = h ? cited.find((c) => host(c.url) === h && (c.url === url || new URL(c.url).pathname === new URL(url).pathname)) : null;
    if (!hit) continue;
    const label = what.trim().slice(0, 120);
    if (!label || out.some((o) => o.what.toLowerCase() === label.toLowerCase() && o.date === date)) continue;
    out.push({ what: label, date, source: { title: hit.title, url: hit.url } });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
}
