import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/current-user";
import { microsoftConfig, msAuthUrl, MS_OAUTH_COOKIE, msRedirectUriFor, newMsOAuthState } from "@/server/integrations/microsoft";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { isPro } from "@/server/billing";

export const dynamic = "force-dynamic";

/** Sends the user to Microsoft to approve read-only calendar access (OAuth 2.0 with PKCE + state). */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    if (!isPro(user)) return NextResponse.redirect(new URL("/settings/plan?need=microsoft", req.url));
    const cfg = microsoftConfig();
    if (!cfg) return NextResponse.redirect(new URL("/settings/integrations?microsoft=not_configured", req.url));
    // Microsoft returns to APP_URL; starting on another host would lose the session and state cookie there.
    if (cfg.appUrl && req.nextUrl.origin !== cfg.appUrl) return NextResponse.redirect(`${cfg.appUrl}/settings/integrations?microsoft=use_main_site`);
    await enforceRateLimit(`microsoft-oauth:${user.id}`, 10, 600);
    const { state, verifier, challenge } = newMsOAuthState();
    const redirectUri = msRedirectUriFor(req.nextUrl.origin, cfg.appUrl);
    const res = NextResponse.redirect(msAuthUrl({ clientId: cfg.clientId, tenant: cfg.tenant, redirectUri, state, challenge, loginHint: user.email }));
    res.cookies.set(MS_OAUTH_COOKIE, Buffer.from(JSON.stringify({ state, verifier, uid: user.id })).toString("base64url"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/microsoft",
      maxAge: 600,
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
