"use server";

import { after } from "next/server";
import { redirect, unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAccountUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { audit } from "@/server/services/audit";
import { afterAgeLock, saveBirthday } from "@/server/services/onboarding";
import { ServiceError } from "@/server/services/errors";
import { confirmEmailCode, sendConfirmCode } from "@/server/services/email-confirm";
import { recordError } from "@/server/services/error-reports";
import { maskEmail } from "@/server/auth/two-factor";

export type ConfirmState = { sentTo?: string; error?: string; confirmed?: boolean; at: number } | null;

/** "Send code": emails a 6-digit code to the signed-in person's own address. Open to people waiting (account data). */
export async function sendEmailCode(_prev: ConfirmState, _fd?: FormData): Promise<ConfirmState> {
  const user = await getAccountUser();
  if (!user) return { error: "Please sign in again.", at: Date.now() };
  const db = getDb();
  const r = await sendConfirmCode(db, user.id);
  if (r.ok) return { sentTo: maskEmail(user.email), at: Date.now() };
  if (r.reason === "already") return { confirmed: true, at: Date.now() };
  if (r.reason === "unavailable") return { error: "Email codes aren't available yet. Please try again later.", at: Date.now() };
  if (r.reason === "too_many") return { error: "We've sent a few codes already. Use the newest one, or try again in an hour.", at: Date.now() };
  await recordError(db, { source: "server", route: "/waitlist", message: `email confirmation send failed${r.why ? `: ${r.why}` : ""}` }).catch(() => {});
  return { error: "We couldn't send the email just now. Try again in a minute.", at: Date.now() };
}

/** Checks the typed code. A right one confirms the email and, if a friend invited them, moves that friend up. */
export async function confirmEmail(_prev: ConfirmState, fd: FormData): Promise<ConfirmState> {
  const user = await getAccountUser();
  if (!user) return { error: "Please sign in again.", at: Date.now() };
  const r = await confirmEmailCode(getDb(), user.id, String(fd.get("code") ?? "").slice(0, 20));
  // No page refresh here: the card keeps its own "confirmed" line so the person sees it worked (the page is read again on the next visit).
  if (r.ok) return { confirmed: true, at: Date.now() };
  const error = {
    wrong: "That code didn't match. Check the newest email.",
    expired: "That code expired. Ask for a new one.",
    none: "That code didn't work. Ask for a new one.",
    locked: "Too many wrong tries. Ask for a new code.",
    too_many: "You've tried too many times today. Try again tomorrow.",
  }[r.reason];
  return { error, at: Date.now() };
}

export type BirthdayState = { ok?: boolean; confirm?: string; error?: string; at: number } | null;

/**
 * The birthday, asked first on the waitlist (owner, 2026-11-21: sign-up goes straight to the waitlist; LifeFlow is for 13 and
 * older, as the Terms say). The same rules as setup's step (`saveBirthday`): someone still in setup has nothing to lose and is
 * locked at once under 13; an account that finished setup earlier is read the date back first. Open to people waiting.
 */
export async function saveWaitlistBirthday(birthDate: string, confirmed = false): Promise<BirthdayState> {
  const user = await getAccountUser();
  if (!user) return { error: "Please sign in again.", at: Date.now() };
  let blocked = false;
  try {
    const r = await withUser(user.id, async (s) => {
      const out = await saveBirthday(s, user.timezone || "UTC", String(birthDate).slice(0, 10), { confirmed });
      if (!out.confirm) await audit(s, "user", out.blocked ? "profile.age_blocked" : "profile.birthday");
      return out;
    });
    if (r.confirm) return { confirm: r.confirm, at: Date.now() };
    blocked = r.blocked;
    // the lock is committed: close their bank and Google links where they live (retried by the sync cron if this fails)
    if (blocked) after(() => afterAgeLock(getDb(), user.id));
    revalidatePath("/waitlist");
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof ServiceError ? e.message : "Couldn't save. Try again.", at: Date.now() };
  }
  if (blocked) redirect("/welcome");
  return { ok: true, at: Date.now() };
}
