import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/current-user";
import { authUrl, googleConfig, newOAuthState, OAUTH_COOKIE, redirectUriFor } from "@/server/integrations/google";
import { enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { isPro } from "@/server/billing";

export const dynamic = "force-dynamic";

/** Sends the user to Google to approve access (OAuth 2.0 with PKCE + state). */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    if (!isPro(user)) return NextResponse.redirect(new URL("/settings/plan?need=google", req.url));
    const cfg = googleConfig();
    if (!cfg) return NextResponse.redirect(new URL("/settings/integrations?google=not_configured", req.url));
    // Google returns to APP_URL; starting on another host (e.g. a preview URL) would lose the session and state cookie there.
    if (cfg.appUrl && req.nextUrl.origin !== cfg.appUrl) return NextResponse.redirect(`${cfg.appUrl}/settings/integrations?google=use_main_site`);
    await enforceRateLimit(`google-oauth:${user.id}`, 10, 600);
    const { state, verifier, challenge } = newOAuthState();
    const redirectUri = redirectUriFor(req.nextUrl.origin, cfg.appUrl);
    const res = NextResponse.redirect(authUrl({ clientId: cfg.clientId, redirectUri, state, challenge, loginHint: user.email }));
    res.cookies.set(OAUTH_COOKIE, Buffer.from(JSON.stringify({ state, verifier, uid: user.id })).toString("base64url"), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/integrations/google",
      maxAge: 600,
    });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
