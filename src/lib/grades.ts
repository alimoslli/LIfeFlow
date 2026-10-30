/**
 * Grades from what the user typed: "45/50", "92%", "92" (out of the assignment's
 * points, or a percent), or a letter. Everything is a fraction (0.92 = 92%).
 */
const LETTER: Record<string, number> = {
  "A+": 0.98,
  A: 0.95,
  "A-": 0.915,
  "B+": 0.885,
  B: 0.85,
  "B-": 0.815,
  "C+": 0.785,
  C: 0.75,
  "C-": 0.715,
  "D+": 0.685,
  D: 0.65,
  "D-": 0.615,
  F: 0.5,
};

export function parseScore(grade: string | null | undefined, pointsPossible?: number | null): number | null {
  const g = grade?.trim().toUpperCase();
  if (!g) return null;
  if (g in LETTER) return LETTER[g];
  const frac = g.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (frac) return Number(frac[2]) > 0 ? Number(frac[1]) / Number(frac[2]) : null;
  const pct = g.match(/^(\d+(?:\.\d+)?)\s*%$/);
  if (pct) return Number(pct[1]) / 100;
  if (/^\d+(?:\.\d+)?$/.test(g)) {
    const n = Number(g);
    return pointsPossible && pointsPossible > 0 ? n / pointsPossible : n / 100;
  }
  return null;
}

export function letterFor(percent: number) {
  const cut: [number, string][] = [
    [93, "A"],
    [90, "A-"],
    [87, "B+"],
    [83, "B"],
    [80, "B-"],
    [77, "C+"],
    [73, "C"],
    [70, "C-"],
    [67, "D+"],
    [63, "D"],
    [60, "D-"],
  ];
  return cut.find(([min]) => percent >= min)?.[1] ?? "F";
}

export type GradedItem = { kind: string; grade: string | null; pointsPossible: number | null };
/** Percent weight per assignment kind, e.g. { exam: 40, assignment: 30, quiz: 30 }. */
export type GradeWeights = Record<string, number>;

/**
 * The current grade from graded work. With weights, each kind's average counts by its weight
 * (only kinds that have grades yet); without, it's total points (or a plain average).
 */
export function courseGrade(items: GradedItem[], weights?: GradeWeights | null) {
  const graded = items.map((i) => ({ ...i, score: parseScore(i.grade, i.pointsPossible) })).filter((i) => i.score !== null) as (GradedItem & {
    score: number;
  })[];
  if (!graded.length) return null;
  const avg = (xs: typeof graded) =>
    xs.every((x) => x.pointsPossible && x.pointsPossible > 0)
      ? xs.reduce((s, x) => s + x.score * x.pointsPossible!, 0) / xs.reduce((s, x) => s + x.pointsPossible!, 0)
      : xs.reduce((s, x) => s + x.score, 0) / xs.length;
  const w = Object.entries(weights ?? {}).filter(([, v]) => v > 0);
  let fraction = avg(graded);
  let countedWeight: number | null = null;
  if (w.length) {
    const parts = w.map(([kind, weight]) => ({ weight, xs: graded.filter((g) => g.kind === kind) })).filter((p) => p.xs.length);
    const total = parts.reduce((s, p) => s + p.weight, 0);
    if (total > 0) {
      fraction = parts.reduce((s, p) => s + p.weight * avg(p.xs), 0) / total;
      countedWeight = Math.round((total / w.reduce((s, [, v]) => s + v, 0)) * 100);
    }
  }
  const percent = Math.round(fraction * 1000) / 10;
  return { percent, letter: letterFor(percent), graded: graded.length, countedWeight };
}

/** The score needed on a final worth `finalWeight`% to finish at `target`%, given the current grade. Can be above 100 or below 0. */
export function neededOnFinal(currentPercent: number, finalWeight: number, targetPercent: number) {
  const f = finalWeight / 100;
  if (f <= 0 || f > 1) return null;
  return Math.round(((targetPercent - currentPercent * (1 - f)) / f) * 10) / 10;
}
