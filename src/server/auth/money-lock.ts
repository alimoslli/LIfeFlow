import { cookies } from "next/headers";
import { getDb } from "../db/client";
import type { UserPreferences } from "../db/schema";
import { moneyUnlockedAt, SESSION_COOKIE, setMoneyUnlockedAt, type SessionUser } from "./sessions";

/**
 * Optional Face ID / Touch ID lock for Money and investments. When it's on,
 * money pages (and Jarvis's money tools) need a passkey check in this session
 * within the last `idleMinutes`; using Money keeps it unlocked (sliding).
 * Enforced on the server for every money page, not just hidden in the browser.
 */

export const MONEY_LOCK_DEFAULT_IDLE = 5;
export const MONEY_LOCK_IDLE_CHOICES = [1, 5, 15, 30] as const;

export function moneyLockSettings(prefs: UserPreferences | undefined) {
  return { enabled: prefs?.moneyLock?.enabled === true, idleMinutes: prefs?.moneyLock?.idleMinutes ?? MONEY_LOCK_DEFAULT_IDLE };
}

/** Pure rule, so it's easy to test: locked unless unlocked within the idle window. */
export function isMoneyLocked(settings: { enabled: boolean; idleMinutes: number }, unlockedAt: Date | null, now = new Date()) {
  if (!settings.enabled) return false;
  return !unlockedAt || now.getTime() - unlockedAt.getTime() > settings.idleMinutes * 60_000;
}

/** For the current request's session. Pass `touch` from money pages to keep it unlocked while in use. */
export async function moneyLocked(user: SessionUser, opts: { touch?: boolean } = {}) {
  const settings = moneyLockSettings(user.preferences);
  if (!settings.enabled) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  const db = getDb();
  const at = await moneyUnlockedAt(db, token);
  const now = new Date();
  if (isMoneyLocked(settings, at, now)) return true;
  // Slide the window at most every 30 seconds.
  if (opts.touch && at && now.getTime() - at.getTime() > 30_000) await setMoneyUnlockedAt(db, token, now);
  return false;
}
