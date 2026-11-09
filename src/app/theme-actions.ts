"use server";
import { cookies } from "next/headers";
import { PREF_COOKIE_MAX_AGE, TEXT_COOKIE, THEME_COOKIE, TODAY_COOKIE, parseTextSize, parseTheme, parseTodayMode } from "@/lib/theme";

/** Remembers the appearance choice on this device (no account needed, works on the sign-in page too). */
export async function setThemeAction(theme: string) {
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), { path: "/", maxAge: PREF_COOKIE_MAX_AGE, sameSite: "lax", httpOnly: false });
}

/** Remembers how Today's sky is shown on this device: the whole top of the screen, or a card. */
export async function setTodayModeAction(mode: string) {
  (await cookies()).set(TODAY_COOKIE, parseTodayMode(mode), { path: "/", maxAge: PREF_COOKIE_MAX_AGE, sameSite: "lax", httpOnly: false });
}

/** Remembers the text size on this device. */
export async function setTextSizeAction(size: string) {
  (await cookies()).set(TEXT_COOKIE, parseTextSize(size), { path: "/", maxAge: PREF_COOKIE_MAX_AGE, sameSite: "lax", httpOnly: false });
}
