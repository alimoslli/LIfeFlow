import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import { exchangeCode, GoogleError, googleConfig, OAUTH_COOKIE, redirectUriFor, saveGoogleConnection, syncGoogleCalendar } from "@/server/integrations/google";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

/** Google redirects back here. Checks state, exchanges the code, stores tokens encrypted, first calendar sync. */
export async function GET(req: NextRequest) {
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/settings/integrations?google=${result}`, req.url));
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/integrations/google" });
    return res;
  };
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const cfg = googleConfig();
  if (!cfg) return back("not_configured");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return back(p.get("error") === "access_denied" ? "denied" : "failed");
  let saved: { state?: string; verifier?: string; uid?: string } = {};
  try {
    saved = JSON.parse(Buffer.from(req.cookies.get(OAUTH_COOKIE)?.value ?? "", "base64url").toString("utf8"));
  } catch {}
  const code = p.get("code");
  if (!code || !saved.state || saved.state !== p.get("state") || saved.uid !== user.id || !saved.verifier) {
    console.error("[google] callback state check failed", { hasCode: !!code, hasCookie: !!saved.state });
    return back("failed");
  }
  try {
    const { creds, email } = await exchangeCode(code, saved.verifier, redirectUriFor(req.nextUrl.origin, cfg.appUrl));
    await withUser(user.id, async (s) => {
      await saveGoogleConnection(s, creds, email);
      await audit(s, "user", "integration.google.connected");
    });
    // First calendar sync; a failure here doesn't undo the connection.
    await withUser(user.id, (s) => syncGoogleCalendar(s, user.timezone)).catch((e) => console.error("[google] first sync", e));
    return back("connected");
  } catch (e) {
    console.error("[google] callback", e);
    return back(e instanceof GoogleError && /permissions/.test(e.message) ? "missing_scopes" : "failed");
  }
}
