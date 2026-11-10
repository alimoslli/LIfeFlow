import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { startSession } from "./current-user";
import { CHALLENGE_COOKIE, createLoginChallenge } from "./two-factor";
import { getDb } from "../db/client";
import { withUser } from "../db/with-user";
import { audit } from "../services/audit";
import { OAUTH_LINK_COOKIE, skipsSecondStep, type OAuthOutcome, type OAuthProvider } from "./oauth";

const secure = () => process.env.NODE_ENV === "production";

/** Where Apple or Google sign-in goes next. A session starts only here, and 2FA still applies. */
export async function finishOAuth(outcome: OAuthOutcome, o: { provider: OAuthProvider; next: string; origin: string; ip: string }) {
  const go = (path: string) => NextResponse.redirect(new URL(path, o.origin), 303);
  const jar = await cookies();
  switch (outcome.kind) {
    case "linked":
      return go(`/settings/security?${o.provider}=linked`);
    case "link-required":
      jar.set(OAUTH_LINK_COOKIE, outcome.pendingToken, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", expires: outcome.expiresAt });
      return go(`/login?link=${o.provider}&email=${encodeURIComponent(outcome.email)}`);
    case "created":
      await startSession(outcome.userId);
      return go("/welcome");
    case "signed-in": {
      // Google already verified the person (owner, 2026-11-10), so no code of ours; Apple keeps the second step.
      // A Google session is marked as having skipped it, and the admin account keeps the code.
      const googleSkips = await skipsSecondStep(getDb(), o.provider, outcome.userId, outcome.totpEnabled);
      if (googleSkips) {
        await startSession(outcome.userId, { secondStepSkipped: true });
        await withUser(outcome.userId, (s) => audit(s, "user", "auth.login", undefined, { ip: o.ip, method: o.provider }));
        return go(o.next);
      }
      if (outcome.totpEnabled) {
        const { token, expiresAt } = await createLoginChallenge(getDb(), outcome.userId, "oauth");
        jar.set(CHALLENGE_COOKIE, token, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", expires: expiresAt });
        return go(o.next === "/" ? "/login/verify" : `/login/verify?next=${encodeURIComponent(o.next)}`);
      }
      await startSession(outcome.userId);
      await withUser(outcome.userId, (s) => audit(s, "user", "auth.login", undefined, { ip: o.ip, method: o.provider }));
      return go(o.next);
    }
  }
}
