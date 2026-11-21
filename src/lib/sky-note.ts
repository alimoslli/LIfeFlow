import type { SkyInsight } from "@/lib/sky-insights";
import { formatDateStr } from "@/lib/dates";

/** Today's note, as AssistantLine draws it (kept here so it stays pure and tested). */
export type SkyNote = { id: string; text: string; tone: "attention" | "heads-up" | "good"; href?: string; prompt?: string; label?: string };

/** "14:30" as "2:30 PM". */
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/**
 * What the sky noticed on its own (lib/sky-insights), said by Today's note when nothing real is coming in the next 24 hours
 * (Today v2, owner 2026-11-16: "only when nothing is that close does the briefing's note show"). Its one step stays one tap:
 * a page, a message's own step, or a question for the skyling. "Block it" asks the skyling to book that exact time, so the
 * booking comes back with its usual Undo.
 */
export function skyNote(i: SkyInsight, today: string): SkyNote {
  const tone = i.weather === "storm" ? "attention" : i.weather === "grey" ? "heads-up" : "good";
  const base = { id: i.id, text: i.headline, tone } as const;
  const a = i.action;
  if (!a) return base;
  if (a.type === "open") return { ...base, href: a.href, label: a.label };
  if (a.type === "ask") return { ...base, prompt: a.prompt, label: a.label };
  if (a.type === "message") return a.href ? { ...base, href: a.href, label: a.label } : { ...base, prompt: a.prompt ?? i.headline, label: a.label };
  const day = a.block.date === today ? "today" : formatDateStr(a.block.date, "EEEE");
  return { ...base, prompt: `Block ${day} ${clock(a.block.start)} to ${clock(a.block.end)} for ${a.block.title}`, label: a.label };
}
