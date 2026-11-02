import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/server/auth/current-user";
import { withUser } from "@/server/db/with-user";
import {
  exchangeMsCode,
  MicrosoftError,
  microsoftConfig,
  MS_OAUTH_COOKIE,
  msRedirectUriFor,
  saveMicrosoftConnection,
  syncMicrosoftCalendar,
} from "@/server/integrations/microsoft";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

/** Microsoft redirects back here. Checks state, exchanges the code, stores tokens encrypted, first calendar sync. */
export async function GET(req: NextRequest) {
  const back = (result: string) => {
    const res = NextResponse.redirect(new URL(`/settings/integrations?microsoft=${result}`, req.url));
    res.cookies.delete({ name: MS_OAUTH_COOKIE, path: "/api/integrations/microsoft" });
    return res;
  };
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  const cfg = microsoftConfig();
  if (!cfg) return back("not_configured");
  const p = req.nextUrl.searchParams;
  const err = p.get("error");
  if (err) {
    const desc = p.get("error_description") ?? "";
    return back(
      err === "access_denied" && !/AADSTS(65001|90094|90095)/.test(desc) ? "denied" : /AADSTS(65001|90094|90095)/.test(desc) ? "admin_consent" : "failed",
    );
  }
  let saved: { state?: string; verifier?: string; uid?: string } = {};
  try {
    saved = JSON.parse(Buffer.from(req.cookies.get(MS_OAUTH_COOKIE)?.value ?? "", "base64url").toString("utf8"));
  } catch {}
  const code = p.get("code");
  if (!code || !saved.state || saved.state !== p.get("state") || saved.uid !== user.id || !saved.verifier) {
    console.error("[microsoft] callback state check failed", { hasCode: !!code, hasCookie: !!saved.state });
    return back("failed");
  }
  try {
    const { creds, email } = await exchangeMsCode(code, saved.verifier, msRedirectUriFor(req.nextUrl.origin, cfg.appUrl));
    await withUser(user.id, async (s) => {
      await saveMicrosoftConnection(s, creds, email);
      await audit(s, "user", "integration.microsoft.connected");
    });
    // First calendar sync; a failure here doesn't undo the connection.
    await withUser(user.id, (s) => syncMicrosoftCalendar(s, user.timezone)).catch((e) => console.error("[microsoft] first sync", e));
    return back("connected");
  } catch (e) {
    console.error("[microsoft] callback", e instanceof Error ? e.message : e);
    if (e instanceof MicrosoftError && e.message === "admin_consent") return back("admin_consent");
    return back(e instanceof MicrosoftError && /Calendar access/.test(e.message) ? "missing_scopes" : "failed");
  }
}
