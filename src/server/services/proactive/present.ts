import { formatIn } from "@/lib/dates";
import { hasAmount, LOCKED_MONEY_PUSH, pushText } from "@/lib/jarvis-voice";
import type { CardMessage } from "@/components/jarvis/message-card";
import type { JarvisMessage } from "./engine";
import { isMoneyAction } from "./respond";

/**
 * Shapes a stored message for the card component. While Money is locked, a card that isn't about money (the morning
 * brief, the weekly review) loses its money lines: amounts stay behind the lock, like on the lock screen.
 */
export function toCard(m: JarvisMessage, tz: string, opts: { moneyLocked?: boolean } = {}): CardMessage {
  const a = m.action;
  const locked = opts.moneyLocked === true;
  const raw = Array.isArray(m.facts.sections) ? (m.facts.sections as { heading: string; lines: string[] }[]) : undefined;
  const sections = locked ? raw?.map((sec) => ({ ...sec, lines: sec.lines.filter((l) => !hasAmount(l)) })).filter((sec) => sec.lines.length > 0) : raw;
  let title = m.title;
  let body = m.body;
  if (locked) {
    const safe = pushText(m.kind, m.facts, { moneyLocked: true, topic: m.topic });
    if (hasAmount(title)) title = safe && !hasAmount(safe.title) ? safe.title : LOCKED_MONEY_PUSH.title;
    if (hasAmount(body)) body = safe && !hasAmount(safe.body) ? safe.body : LOCKED_MONEY_PUSH.body;
  }
  return {
    id: m.id,
    title,
    body,
    status: m.status === "snoozed" && m.snoozedUntil && m.snoozedUntil <= new Date() ? "new" : m.status,
    rating: m.rating,
    action: a
      ? {
          type: a.type,
          label: a.label,
          href: a.type === "open" ? a.href : undefined,
          prompt: a.type === "ask" ? a.prompt : undefined,
          choices: a.type === "answer" || a.type === "promise_check" ? a.choices : undefined,
        }
      : null,
    money: isMoneyAction(a),
    resultText: m.result?.text ?? null,
    undoable: m.status === "done" && !!m.result?.undo && !m.result.undone,
    when: formatIn(m.createdAt, tz, "EEE h:mm a"),
    urgent: m.urgent,
    sections,
  };
}
