import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect for signed-out visitors. This only checks that a
 * session cookie exists; every page, action and API route still validates
 * the session on the server.
 */
const PUBLIC = [
  "/login",
  "/landing",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/privacy",
  "/integrity",
  "/api/sms/inbound",
  "/api/errors",
  "/api/billing/webhook",
  "/terms",
  "/api/health",
  "/api/apple-health/ingest",
  "/api/hq/report",
  "/api/hq/inbox",
  "/api/hq/errors",
  "/api/hq/files",
  "/api/integrations/plaid/webhook",
  "/api/cron/sync",
  "/api/cron/notify",
  "/api/cron/promises",
  "/api/inbox/email",
  "/offline",
  "/sw.js",
];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!req.cookies.has("bf_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    if (pathname === "/") {
      // Signed-out visitors see the landing page at the same address. The header lets the root layout skip the app splash.
      const headers = new Headers(req.headers);
      headers.set("x-lf-landing", "1");
      const url = req.nextUrl.clone();
      url.pathname = "/landing";
      return NextResponse.rewrite(url, { request: { headers } });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|icons/|.*\\.(?:svg|png|jpg|ico|webp|webmanifest)$).*)"],
};
