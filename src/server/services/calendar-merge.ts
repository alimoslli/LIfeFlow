/**
 * Read-time merge of the same event coming from different places (audit 2026-11-06, D4/D5).
 * Nothing is deleted: every provider keeps its own row, and the lists show one event with its sources.
 *  - Different sources, same normalised title, same kind, and both start and end within 5 minutes: one event.
 *    ("personal" is the default kind of a synced event, so it counts as "not classified" and matches any kind.)
 *    Same title but a different length or kind (Work 9 to 5 and Work 9 to 10; a class and an exam) stays two
 *    events, so free time and conflicts see every copy's real time.
 *  - The same flight (a title that starts with "Flight", an airline code and number) on a plain event within
 *    24 hours: one event, even if a schedule change moved the time, the copy came from the inbox or was saved
 *    in another time zone. Course events (class, exam...) never merge this way.
 *  - Two events from the same source with the same title are two events (except the flight rule).
 * The richer row is shown (course link, repeat rule, description, location), with the sources listed.
 */
export type MergeableEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  source: string;
  kind: string;
  courseId: string | null;
  recurrence: unknown;
  description: string | null;
  location: string | null;
  updatedAt: Date;
};

const SAME_TIME_MS = 5 * 60_000;
const SAME_FLIGHT_MS = 24 * 3_600_000;
const FLIGHT_KINDS = new Set(["personal", "other", "reminder"]);

const kindsMatch = (a: string, b: string) => a === b || a === "personal" || b === "personal";

const SOURCE_LABELS: Record<string, string> = {
  google: "Google",
  outlook: "Outlook",
  canvas: "Canvas",
  ukg: "UKG",
  schedule: "Schedule",
  manual: "LifeFlow",
  jarvis: "LifeFlow",
  import: "LifeFlow",
  demo: "LifeFlow",
};
export const sourceLabel = (source: string) => SOURCE_LABELS[source] ?? "LifeFlow";

/** Lower case, no accents, no "Flight:" style prefix, punctuation and spacing flattened. */
export function normalizeTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/^\s*(flight|hotel|train)\s*:\s*/, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** "MS986" from "Flight to Cairo (MS 986)"; null unless it is a plain event titled like a flight with an airline code and number. */
export function flightKey(title: string, kind = "personal") {
  if (!FLIGHT_KINDS.has(kind)) return null;
  if (!/^\s*flight\b/i.test(title)) return null;
  const m = title.match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?(\d{1,4})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

const richness = (e: MergeableEvent) =>
  (e.courseId ? 4 : 0) + (e.recurrence ? 2 : 0) + (e.description ? 2 : 0) + (e.location ? 1 : 0) + (e.kind !== "personal" ? 1 : 0);

function richer<T extends MergeableEvent>(a: T, b: T) {
  const d = richness(b) - richness(a);
  if (d !== 0) return d > 0 ? b : a;
  if (a.updatedAt.getTime() !== b.updatedAt.getTime()) return b.updatedAt > a.updatedAt ? b : a;
  return a.id <= b.id ? a : b;
}

export type Merged<T> = T & { sources: string[]; mergedIds: string[] };

export function mergeCrossSource<T extends MergeableEvent>(events: T[]): Merged<T>[] {
  type Cluster = { best: T; members: T[]; flight: string | null };
  const clusters: Cluster[] = [];
  const byTitle = new Map<string, Cluster[]>();
  const byFlight = new Map<string, Cluster[]>();
  const order = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));

  for (const e of order) {
    const title = normalizeTitle(e.title);
    const flight = flightKey(e.title, e.kind);
    let hit: Cluster | undefined;
    if (flight) hit = (byFlight.get(flight) ?? []).find((c) => c.members.some((m) => Math.abs(m.startsAt.getTime() - e.startsAt.getTime()) < SAME_FLIGHT_MS));
    if (!hit && title) {
      hit = (byTitle.get(title) ?? []).find(
        (c) =>
          !c.members.some((m) => m.source === e.source) &&
          // Compatible with EVERY member (so an unclassified copy can't bridge a class and an exam into one group)
          // and on the same time as at least one.
          c.members.every((m) => kindsMatch(m.kind, e.kind)) &&
          c.members.some(
            (m) => Math.abs(m.startsAt.getTime() - e.startsAt.getTime()) <= SAME_TIME_MS && Math.abs(m.endsAt.getTime() - e.endsAt.getTime()) <= SAME_TIME_MS,
          ),
      );
    }
    if (hit) {
      hit.members.push(e);
      hit.best = richer(hit.best, e);
      continue;
    }
    const c: Cluster = { best: e, members: [e], flight };
    clusters.push(c);
    if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), c]);
    if (flight) byFlight.set(flight, [...(byFlight.get(flight) ?? []), c]);
  }

  return clusters.map((c) => {
    const others = c.members.filter((m) => m !== c.best);
    const sources = [...new Set([c.best.source, ...others.map((m) => m.source)])];
    // A synced "personal" copy of a class or exam takes on the specific kind.
    const kind = c.best.kind === "personal" ? (others.find((m) => m.kind !== "personal")?.kind ?? c.best.kind) : c.best.kind;
    return {
      ...c.best,
      kind,
      description: c.best.description ?? others.find((m) => m.description)?.description ?? null,
      location: c.best.location ?? others.find((m) => m.location)?.location ?? null,
      sources,
      mergedIds: c.members.map((m) => m.id),
    };
  });
}
