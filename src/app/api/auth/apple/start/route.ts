import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { APPLE_STATE_COOKIE, appleConfig, startAppleSignIn } from "@/server/auth/apple";
import { clientIp, getSessionUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const safeNext = (n: string | null) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n.slice(0, 200) : "/");

/** Sends the browser to Apple. ?mode=link (signed in, from Settings) links Apple to the current account. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (path: string) => NextResponse.redirect(new URL(path, url.origin), 303);
  const cfg = appleConfig();
  if (!cfg) return back("/login?error=apple-unavailable");
  const db = getDb();
  if (!(await rateLimit(db, `apple-start:ip:${await clientIp()}`, 30, 900)).allowed) return back("/login?error=rate-limited");
  const mode = url.searchParams.get("mode") === "link" ? "link" : "signin";
  const user = mode === "link" ? await getSessionUser() : null;
  if (mode === "link" && !user) return back("/login");
  const {
    url: appleUrl,
    token,
    expiresAt,
  } = await startAppleSignIn(db, cfg, {
    mode,
    tz: url.searchParams.get("tz") ?? undefined,
    next: safeNext(url.searchParams.get("next")),
    userId: user?.id ?? null,
  });
  // Apple posts the result back from its own site, so this cookie must be SameSite=None (and therefore Secure).
  (await cookies()).set(APPLE_STATE_COOKIE, token, { httpOnly: true, secure: true, sameSite: "none", path: "/api/auth/apple", expires: expiresAt });
  return NextResponse.redirect(appleUrl, 303);
}
