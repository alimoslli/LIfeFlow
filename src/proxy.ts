import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic redirect for signed-out visitors. This only checks that a
 * session cookie exists; every page, action and API route still validates
 * the session on the server.
 */
const PUBLIC = ["/login", "/signup", "/privacy", "/terms", "/api/health", "/api/apple-health/ingest"];

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!req.cookies.has("bf_session")) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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
