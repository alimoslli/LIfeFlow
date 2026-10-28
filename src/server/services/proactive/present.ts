import { formatIn } from "@/lib/dates";
import type { CardMessage } from "@/components/jarvis/message-card";
import type { JarvisMessage } from "./engine";
import { isMoneyAction } from "./respond";

/** Shapes a stored message for the card component. */
export function toCard(m: JarvisMessage, tz: string): CardMessage {
  const a = m.action;
  return {
    id: m.id,
    title: m.title,
    body: m.body,
    status: m.status === "snoozed" && m.snoozedUntil && m.snoozedUntil <= new Date() ? "new" : m.status,
    rating: m.rating,
    action: a
      ? {
          type: a.type,
          label: a.label,
          href: a.type === "open" ? a.href : undefined,
          prompt: a.type === "ask" ? a.prompt : undefined,
          choices: a.type === "answer" ? a.choices : undefined,
        }
      : null,
    money: isMoneyAction(a),
    resultText: m.result?.text ?? null,
    undoable: m.status === "done" && !!m.result?.undo && !m.result.undone,
    when: formatIn(m.createdAt, tz, "EEE h:mm a"),
    urgent: m.urgent,
    sections: Array.isArray(m.facts.sections) ? (m.facts.sections as { heading: string; lines: string[] }[]) : undefined,
  };
}
