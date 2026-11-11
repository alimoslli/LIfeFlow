"use server";

import { getAccountUser, clientIp } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { confirmEmailCode, sendConfirmCode } from "@/server/services/email-confirm";
import { recordError } from "@/server/services/error-reports";
import { maskEmail } from "@/server/auth/two-factor";

export type ConfirmState = { sentTo?: string; error?: string; confirmed?: boolean; at: number } | null;

/** "Send code": emails a 6-digit code to the signed-in person's own address. Open to people waiting (account data). */
export async function sendEmailCode(_prev: ConfirmState, _fd?: FormData): Promise<ConfirmState> {
  const user = await getAccountUser();
  if (!user) return { error: "Please sign in again.", at: Date.now() };
  const db = getDb();
  const r = await sendConfirmCode(db, user.id, await clientIp());
  if (r.ok) return { sentTo: maskEmail(user.email), at: Date.now() };
  if (r.reason === "already") return { confirmed: true, at: Date.now() };
  if (r.reason === "unavailable") return { error: "Email codes aren't available yet. Please try again later.", at: Date.now() };
  if (r.reason === "too_many") return { error: "We've sent a few codes already. Use the newest one, or try again in an hour.", at: Date.now() };
  await recordError(db, { source: "server", route: "/waitlist", message: "email confirmation send failed" }).catch(() => {});
  return { error: "We couldn't send the email just now. Try again in a minute.", at: Date.now() };
}

/** Checks the typed code. A right one confirms the email and, if a friend invited them, moves that friend up. */
export async function confirmEmail(_prev: ConfirmState, fd: FormData): Promise<ConfirmState> {
  const user = await getAccountUser();
  if (!user) return { error: "Please sign in again.", at: Date.now() };
  const r = await confirmEmailCode(getDb(), user.id, String(fd.get("code") ?? "").slice(0, 20), await clientIp());
  // No page refresh here: the card keeps its own "confirmed" line so the person sees it worked (the page is read again on the next visit).
  if (r.ok) return { confirmed: true, at: Date.now() };
  const error = {
    wrong: "That code didn't match. Check the newest email.",
    expired: "That code expired. Ask for a new one.",
    locked: "Too many wrong tries. Ask for a new code.",
    too_many: "Too many tries. Please wait a few minutes.",
  }[r.reason];
  return { error, at: Date.now() };
}
