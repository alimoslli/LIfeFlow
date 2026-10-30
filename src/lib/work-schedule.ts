import type { WorkSchedule } from "@/server/db/schema";

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const time = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
};

/** "Mon–Fri, 8 AM–5 PM" or "Mon, Wed, Fri, 9 AM–1 PM". */
export function scheduleLabel(s: WorkSchedule) {
  const d = [...s.days].sort((a, b) => a - b);
  const run = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  return `${run ? `${DAY[d[0]]}–${DAY[d.at(-1)!]}` : d.map((x) => DAY[x]).join(", ")}, ${time(s.start)}–${time(s.end)}`;
}
