/** What the hero picks: of the goals you're working toward, the one nearest to done. */
export type Aim = { key: string; fraction: number | null; date: string | null };

/**
 * Highest share done wins (a goal with a number or a money goal), the earlier date breaking a tie. With no number anywhere,
 * the earliest date, then the first in the list. Only real progress counts; nothing is guessed.
 */
export function closestAim<T extends Aim>(aims: T[]): T | null {
  if (!aims.length) return null;
  const byDate = (a: T, b: T) => (a.date ?? "9999").localeCompare(b.date ?? "9999");
  const measured = aims.filter((a) => a.fraction != null && a.fraction < 1);
  if (measured.length) return [...measured].sort((a, b) => b.fraction! - a.fraction! || byDate(a, b))[0];
  const dated = aims.filter((a) => a.date);
  if (dated.length) return [...dated].sort(byDate)[0];
  return aims[0];
}

/** Squares for the hero row: one each for a small total, twelve otherwise. */
export function squares(done: number, total: number): { filled: number; count: number } {
  if (total <= 0) return { filled: 0, count: 0 };
  const count = total <= 12 ? total : 12;
  const filled = total <= 12 ? Math.min(done, total) : Math.min(count, done > 0 ? Math.max(1, Math.round((done / total) * count)) : 0);
  return { filled, count };
}
