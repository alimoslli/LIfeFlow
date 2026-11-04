"use server";
import { cookies } from "next/headers";
import { TEXT_COOKIE, THEME_COOKIE, parseTextSize, parseTheme } from "@/lib/theme";

/** Remembers the appearance choice on this device (no account needed, works on the sign-in page too). */
export async function setThemeAction(theme: string) {
  (await cookies()).set(THEME_COOKIE, parseTheme(theme), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
}

/** Remembers the text size on this device. */
export async function setTextSizeAction(size: string) {
  (await cookies()).set(TEXT_COOKIE, parseTextSize(size), { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: false });
}
