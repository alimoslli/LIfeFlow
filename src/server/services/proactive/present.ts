import { formatIn } from "@/lib/dates";
import { hasAmount, LOCKED_MONEY_PUSH, pushText } from "@/lib/jarvis-voice";
import type { CardMessage } from "@/components/jarvis/message-card";
import type { JarvisMessage } from "./engine";
import { isMoneyAction } from "./respond";

type Section = { heading: string; lines: string[]; money?: boolean };
/** The money parts of reviews saved before each part carried its own `money` mark (reviews.ts). */
const MONEY_PARTS = new Set(["Money", "Spending", "Goals", "Patterns", "Net worth", "Savings rate", "Top spending", "Subscriptions", "Dreams"]);

/**
 * A stored message's words as anyone may see them. While Money is locked, a message that isn't about money (the morning
 * brief, the weekly review) loses its money lines whatever its topic says: amounts stay behind the lock, like on the
 * lock screen. Shared by the card and the sky (sky-insights.ts), so neither can show what the other hides.
 */
export function lockSafeText(m: Pick<JarvisMessage, "kind" | "title" | "body" | "facts" | "topic">, opts: { moneyLocked?: boolean } = {}) {
  const raw = Array.isArray(m.facts.sections) ? (m.facts.sections as Section[]).map(({ money: _, ...sec }) => sec) : undefined;
  if (opts.moneyLocked !== true) return { title: m.title, body: m.body, sections: raw };
  // the part itself says it's money (set where the review is made); a review saved before that is read by its heading;
  // a line naming an amount is the last backstop
  const sections = (m.facts.sections as Section[] | undefined)
    ?.filter((sec) => !(sec.money ?? MONEY_PARTS.has(sec.heading)))
    .map((sec) => ({ heading: sec.heading, lines: sec.lines.filter((l) => !hasAmount(l)) }))
    .filter((sec) => sec.lines.length > 0);
  let title = m.title;
  let body = m.body;
  const safe = pushText(m.kind, m.facts, { moneyLocked: true, topic: m.topic });
  if (hasAmount(title)) title = safe && !hasAmount(safe.title) ? safe.title : LOCKED_MONEY_PUSH.title;
  if (hasAmount(body)) body = safe && !hasAmount(safe.body) ? safe.body : LOCKED_MONEY_PUSH.body;
  return { title, body, sections };
}

/**
 * Shapes a stored message for the card component. While Money is locked, a card that isn't about money (the morning
 * brief, the weekly review) loses its money lines: amounts stay behind the lock, like on the lock screen.
 */
export function toCard(m: JarvisMessage, tz: string, opts: { moneyLocked?: boolean } = {}): CardMessage {
  const a = m.action;
  const { title, body, sections } = lockSafeText(m, opts);
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
