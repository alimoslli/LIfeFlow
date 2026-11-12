import { NextResponse, type NextRequest } from "next/server";
import { SETUP_COOKIE } from "@/lib/setup-mode";

/**
 * Picks which setup this browser sees, for the owner's comparison: /setup is the one inside the app, /setup?old=1 is the
 * separate welcome. Only sets a cookie and goes to a fixed path.
 */
export function GET(req: NextRequest) {
  const old = req.nextUrl.searchParams.get("old") === "1";
  const res = NextResponse.redirect(new URL(old ? "/welcome" : "/", req.nextUrl.origin), 303);
  res.cookies.set(SETUP_COOKIE, old ? "old" : "app", { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
