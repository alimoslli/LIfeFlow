"use server";
import { cookies } from "next/headers";
import { ACCENT_COOKIE, THEME_COOKIE, parseAccent, parseTheme } from "@/lib/theme";

/** Remembers the appearance choice on this device (no account needed, works on the sign-in page too). */
export async function setThemeAction(theme: string) {
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
}

/** Remembers the accent color on this device. */
export async function setAccentAction(accent: string) {
  (await cookies()).set(ACCENT_COOKIE, parseAccent(accent), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
}
