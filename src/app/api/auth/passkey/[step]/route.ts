import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { clientIp, startSession } from "@/server/auth/current-user";
import { consumePendingAppleLink } from "@/server/auth/apple";
import { setChallengeCookie, takeChallengeCookie } from "@/server/auth/passkey-http";
import { finishPasskeyAuthentication, PasskeyError, relyingParty, startPasskeyAuthentication } from "@/server/auth/passkeys";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

const safeNext = (n: unknown) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/");

/**
 * Signing in with a passkey (Face ID / Touch ID). Public: there's no session yet.
 *   POST /api/auth/passkey/options  → challenge for the browser
 *   POST /api/auth/passkey/verify   → checks the signed response and starts a session
 * A passkey with user verification is already two factors (the device + Face ID or its passcode),
 * so it doesn't also ask for the authenticator-app code.
 */
export async function POST(req: Request, { params }: { params: Promise<{ step: string }> }) {
  try {
    assertSameOrigin(req);
    const { step } = await params;
    const ip = await clientIp();
    const db = getDb();
    const rp = relyingParty(req.url);
    if (step === "options") {
      await enforceRateLimit(`passkey-login-options:ip:${ip}`, 60, 900);
      const { options, token, expiresAt } = await startPasskeyAuthentication(db, rp, "passkey-login");
      await setChallengeCookie("passkey-login", token, expiresAt);
      return NextResponse.json({ options });
    }
    if (step === "verify") {
      await enforceRateLimit(`passkey-login:ip:${ip}`, 30, 900);
      const body = (await req.json().catch(() => null)) as { response?: AuthenticationResponseJSON; next?: string } | null;
      if (!body?.response?.id) throw new HttpError(400, "Invalid request");
      const token = await takeChallengeCookie("passkey-login");
      let r;
      try {
        r = await finishPasskeyAuthentication(db, "passkey-login", token, body.response, rp);
      } catch (e) {
        if (e instanceof PasskeyError) throw new HttpError(400, e.message);
        throw e;
      }
      await startSession(r.userId);
      const linked = await consumePendingAppleLink(db, r.userId);
      await withUser(r.userId, (s) =>
        audit(s, "user", "auth.login", undefined, { ip, method: "passkey", passkey: r.name, ...(linked && { appleLinked: true }) }),
      );
      return NextResponse.json({ ok: true, next: safeNext(body.next) });
    }
    throw new HttpError(404, "Not found");
  } catch (e) {
    return errorResponse(e);
  }
}
