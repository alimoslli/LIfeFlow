import { eq, inArray } from "drizzle-orm";
import { getDb, type Database } from "../db/client";
import { aiBudgets } from "../db/schema";
import { emailConfig, sendEmail } from "../integrations/email";
import { companyDay, companyKey, companyLimits, companyMonth } from "./ai-limits";

/**
 * Warnings about the company's AI ceilings (ADR 0035): at 50%, 80% and 100% of the month's and the day's ceiling, once each per period,
 * to the owner by email (the same address and sender as error alerts). At 100% the skyling is already paused for everyone but admins
 * (ai-gate.ts); the email says so. Numbers only, never a person or content.
 */

export const WARN_AT = [50, 80, 100] as const;

export type CeilingDeps = {
  /** Sends one email; defaults to the real provider when it is configured. Returns false when nothing could be sent. */
  send?: (subject: string, text: string) => Promise<boolean>;
  db?: Database;
};

const dollars = (micros: number) => `$${(micros / 1_000_000).toFixed(2)}`;

async function defaultSend(subject: string, text: string): Promise<boolean> {
  const to = (process.env.ALERT_EMAIL || process.env.LEGAL_CONTACT_EMAIL)?.trim();
  const cfg = emailConfig();
  if (!to || !cfg) return false;
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<pre style="font:14px/1.5 ui-monospace,monospace">${escaped}</pre>`;
  await sendEmail(cfg, { to, subject, text, html });
  return true;
}

/**
 * Looks at the company counters and warns once for each threshold newly reached. Returns what it warned about ("month 80", ...).
 * The flag for a threshold is claimed before sending (so two requests can't both send) and given back if nothing could be sent,
 * so a missing email setting doesn't swallow the warning.
 */
export async function checkCeilings(now = new Date(), deps: CeilingDeps = {}): Promise<string[]> {
  const db = deps.db ?? getDb();
  const send = deps.send ?? defaultSend;
  const c = companyLimits();
  const periods = [
    { name: "month", period: companyMonth(now), limit: c.monthMicros, left: "until the 1st" },
    { name: "day", period: companyDay(now), limit: c.dayMicros, left: "until tomorrow (UTC)" },
  ];
  const rows = await db
    .select()
    .from(aiBudgets)
    .where(
      inArray(
        aiBudgets.key,
        periods.map((p) => companyKey(p.period, "micros")),
      ),
    );
  const used = new Map(rows.map((r) => [r.key, r.used]));
  const warned: string[] = [];
  for (const p of periods) {
    if (p.limit <= 0) continue;
    const spent = used.get(companyKey(p.period, "micros")) ?? 0;
    const pct = (spent / p.limit) * 100;
    const reached = WARN_AT.filter((t) => pct >= t);
    if (!reached.length) continue;
    const claimed: string[] = [];
    for (const t of reached) {
      const key = `gw:${p.name}:${p.period}:${t}`;
      const won = await db.insert(aiBudgets).values({ key }).onConflictDoNothing().returning({ key: aiBudgets.key });
      if (won.length) claimed.push(key);
    }
    if (!claimed.length) continue;
    const top = reached[reached.length - 1];
    const stop = top >= 100;
    const subject = `LifeFlow: AI spending is at ${top}% of the ${p.name}'s ceiling`;
    const text =
      `The skyling's AI use has reached ${top}% of the company's ${p.name} ceiling (${dollars(spent)} of ${dollars(p.limit)}, counting only work whose cost is priced in settings).\n\n` +
      (stop
        ? `It is now paused for everyone except admins ${p.left}. The rest of the app keeps working. To change the ceiling, set AI_GLOBAL_${p.name.toUpperCase()}_DOLLARS.`
        : `Nothing is paused yet. At 100% the skyling pauses for everyone except admins.`) +
      `\n\nNo personal details are included.`;
    let sent = false;
    try {
      sent = await send(subject, text);
    } catch (e) {
      console.error("[ai-ceiling] warning email failed", e instanceof Error ? e.name : typeof e);
    }
    if (sent) warned.push(`${p.name} ${top}`);
    else for (const key of claimed) await db.delete(aiBudgets).where(eq(aiBudgets.key, key));
  }
  return warned;
}
