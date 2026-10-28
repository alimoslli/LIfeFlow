import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { getSessionUser } from "@/server/auth/current-user";
import { setChallengeCookie, takeChallengeCookie } from "@/server/auth/passkey-http";
import {
  finishPasskeyAuthentication,
  finishPasskeyRegistration,
  PasskeyError,
  passkeyNameFrom,
  relyingParty,
  startPasskeyAuthentication,
  startPasskeyRegistration,
} from "@/server/auth/passkeys";
import { SESSION_COOKIE, setMoneyUnlockedAt } from "@/server/auth/sessions";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/server/db/client";
import { passkeys } from "@/server/db/schema";
import { withUser } from "@/server/db/with-user";
import { assertSameOrigin, enforceRateLimit, errorResponse, HttpError } from "@/server/http";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

/** GET /api/passkeys/status → how many passkeys this account has (for the "Use Face ID next time?" prompt). */
export async function GET(_req: Request, { params }: { params: Promise<{ step: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    if ((await params).step !== "status") throw new HttpError(404, "Not found");
    const [{ n }] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(passkeys)
      .where(eq(passkeys.userId, user.id));
    return NextResponse.json({ count: n, demo: user.accountKind === "demo" });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Passkeys for a signed-in person:
 *   register-options / register-verify  add a passkey (Face ID / Touch ID) to the account
 *   unlock-options / unlock-verify      confirm it's them to unlock Money
 */
export async function POST(req: Request, { params }: { params: Promise<{ step: string }> }) {
  try {
    assertSameOrigin(req);
    const user = await getSessionUser();
    if (!user) throw new HttpError(401, "Not signed in");
    const { step } = await params;
    const db = getDb();
    const rp = relyingParty(req.url);
    const fail = (e: unknown) => {
      if (e instanceof PasskeyError) throw new HttpError(400, e.message);
      throw e;
    };

    switch (step) {
      case "register-options": {
        if (user.accountKind === "demo") throw new HttpError(403, "The shared test account can't add passkeys.");
        await enforceRateLimit(`passkey-register:${user.id}`, 20, 3600);
        const { options, token, expiresAt } = await startPasskeyRegistration(db, user.id, rp).catch(fail);
        await setChallengeCookie("passkey-register", token, expiresAt);
        return NextResponse.json({ options });
      }
      case "register-verify": {
        const body = (await req.json().catch(() => null)) as { response?: RegistrationResponseJSON } | null;
        if (!body?.response?.id) throw new HttpError(400, "Invalid request");
        const token = await takeChallengeCookie("passkey-register");
        const name = passkeyNameFrom((await headers()).get("user-agent"));
        const row = await finishPasskeyRegistration(db, user.id, token, body.response, rp, name).catch(fail);
        await withUser(user.id, (s) => audit(s, "user", "auth.passkey_added", undefined, { name: row.name }));
        return NextResponse.json({ ok: true, passkey: row });
      }
      case "unlock-options": {
        await enforceRateLimit(`passkey-unlock:${user.id}`, 30, 900);
        const { options, token, expiresAt } = await startPasskeyAuthentication(db, rp, "passkey-unlock", user.id).catch(fail);
        await setChallengeCookie("passkey-unlock", token, expiresAt);
        return NextResponse.json({ options });
      }
      case "unlock-verify": {
        const body = (await req.json().catch(() => null)) as { response?: AuthenticationResponseJSON } | null;
        if (!body?.response?.id) throw new HttpError(400, "Invalid request");
        const token = await takeChallengeCookie("passkey-unlock");
        await finishPasskeyAuthentication(db, "passkey-unlock", token, body.response, rp).catch(fail);
        await setMoneyUnlockedAt(db, (await cookies()).get(SESSION_COOKIE)?.value ?? "", new Date());
        await withUser(user.id, (s) => audit(s, "user", "money.unlocked", undefined, { method: "passkey" }));
        return NextResponse.json({ ok: true });
      }
    }
    throw new HttpError(404, "Not found");
  } catch (e) {
    return errorResponse(e);
  }
}
