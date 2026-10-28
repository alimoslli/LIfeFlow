import { and, eq, gt, isNull, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { localTimeOf } from "@/lib/dates";
import { notificationLog, pushSubscriptions, tasks, type UserPreferences } from "../db/schema";
import type { UserScope } from "../db/with-user";

/**
 * Web Push: the to-do reminders the user set, plus Jarvis's important messages (services/proactive).
 * Every notification has a key in notification_log, so it is sent at most
 * once even if the scheduler runs often or twice.
 */

export function pushConfig(env: Record<string, string | undefined> = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || `mailto:${env.LEGAL_CONTACT_EMAIL?.trim() || "notifications@lifeflow.app"}` };
}

export const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000).startsWith("https://"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  deviceLabel: z.string().max(80).nullish(),
});

export async function saveSubscription(scope: UserScope, input: z.input<typeof subscriptionSchema>) {
  const d = subscriptionSchema.parse(input);
  // An endpoint belongs to one browser; if it was registered to someone else on this device, it moves to this user.
  await scope.tx
    .insert(pushSubscriptions)
    .values({ userId: scope.userId, endpoint: d.endpoint, p256dh: d.keys.p256dh, auth: d.keys.auth, deviceLabel: d.deviceLabel ?? null })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { userId: scope.userId, p256dh: d.keys.p256dh, auth: d.keys.auth, deviceLabel: d.deviceLabel ?? null },
    });
}

export async function removeSubscription(scope: UserScope, endpoint: string) {
  await scope.tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, scope.userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function removeSubscriptionById(scope: UserScope, id: string) {
  await scope.tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, scope.userId), eq(pushSubscriptions.id, id)));
}

export const NOTIFICATION_DEFAULTS = { reminders: true, bills: true, morningBrief: true, briefTime: "08:00", budgetAlerts: true };
export const notificationPrefs = (prefs: UserPreferences | undefined) => ({ ...NOTIFICATION_DEFAULTS, ...prefs?.notifications });

export const notificationPrefsSchema = z.object({
  reminders: z.boolean(),
  bills: z.boolean(),
  morningBrief: z.boolean(),
  briefTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Pick a time like 08:00"),
  budgetAlerts: z.boolean(),
});

export async function listSubscriptions(scope: UserScope) {
  return scope.tx.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, scope.userId));
}

export type PushMessage = { title: string; body: string; url: string; tag?: string };
export type Sender = (sub: { endpoint: string; p256dh: string; auth: string }, msg: PushMessage) => Promise<{ ok: boolean; gone: boolean }>;

/** Real sender (web-push). Tests pass their own. */
export async function webPushSender(): Promise<Sender | null> {
  const cfg = pushConfig();
  if (!cfg) return null;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
  return async (sub, msg) => {
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(msg), { TTL: 60 * 60 * 6 });
      return { ok: true, gone: false };
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      return { ok: false, gone: code === 404 || code === 410 };
    }
  };
}

/** Sends once per key to every device the user enabled. Returns true if anything was delivered. */
export async function sendOnce(scope: UserScope, key: string, msg: PushMessage, send: Sender) {
  const [logged] = await scope.tx
    .insert(notificationLog)
    .values({ userId: scope.userId, key, title: msg.title.slice(0, 200) })
    .onConflictDoNothing()
    .returning({ id: notificationLog.id });
  if (!logged) return false;
  const subs = await listSubscriptions(scope);
  let delivered = false;
  for (const s of subs) {
    const r = await send(s, msg);
    if (r.gone) await scope.tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, s.id));
    if (r.ok) {
      delivered = true;
      await scope.tx.update(pushSubscriptions).set({ lastSuccessAt: new Date() }).where(eq(pushSubscriptions.id, s.id));
    }
  }
  return delivered;
}

/** Sends the to-do reminders the user set. Safe to run every few minutes. */
export async function runNotifications(scope: UserScope, tz: string, prefs: UserPreferences | undefined, send: Sender, now = new Date()) {
  const p = notificationPrefs(prefs);
  if (!(await listSubscriptions(scope)).length) return { sent: 0 };
  let sent = 0;

  if (p.reminders) {
    const due = await scope.tx
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, scope.userId),
          ne(tasks.status, "done"),
          isNull(tasks.remindedAt),
          lte(tasks.remindAt, now),
          gt(tasks.remindAt, new Date(now.getTime() - 24 * 3600_000)),
        ),
      );
    for (const t of due) {
      const when = t.dueAt ? (t.dueAllDay ? "today" : `at ${localTimeOf(t.dueAt, tz)}`) : "";
      if (
        await sendOnce(
          scope,
          `task:${t.id}:${t.remindAt!.toISOString()}`,
          { title: t.title, body: `Due ${when}`.trim(), url: `/tasks/${t.id}`, tag: `task-${t.id}` },
          send,
        )
      )
        sent++;
      await scope.tx.update(tasks).set({ remindedAt: now }).where(eq(tasks.id, t.id));
    }
  }

  // Bills, budgets and the morning brief now come from Jarvis (services/proactive), with his daily limit.
  return { sent };
}
