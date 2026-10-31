import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { GOOGLE_STATE_COOKIE, googleSignInConfig, startGoogleSignIn } from "@/server/auth/google-signin";
import { clientIp, getSessionUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n.slice(0, 200) : "/");

/** Sends the browser to Google. ?mode=link (signed in, from Settings) links Google to the current account. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (path: string) => NextResponse.redirect(new URL(path, url.origin), 303);
  const cfg = googleSignInConfig();
  if (!cfg) return back("/login?error=google-unavailable");
  const db = getDb();
  if (!(await rateLimit(db, `google-start:ip:${await clientIp()}`, 30, 900)).allowed) return back("/login?error=rate-limited");
  const mode = url.searchParams.get("mode") === "link" ? "link" : "signin";
  const user = mode === "link" ? await getSessionUser() : null;
  if (mode === "link" && !user) return back("/login");
  const r = await startGoogleSignIn(db, cfg, {
    mode,
    tz: url.searchParams.get("tz") ?? undefined,
    next: safeNext(url.searchParams.get("next")),
    userId: user?.id ?? null,
  });
  // Google returns with a top-level GET redirect, so SameSite=Lax is enough.
  (await cookies()).set(GOOGLE_STATE_COOKIE, r.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    expires: r.expiresAt,
  });
  return NextResponse.redirect(r.url, 303);
}
