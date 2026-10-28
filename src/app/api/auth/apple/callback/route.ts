import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  APPLE_LINK_COOKIE,
  APPLE_STATE_COOKIE,
  appleConfig,
  AppleSignInError,
  completeAppleSignIn,
  exchangeAppleCode,
  nameFromApple,
  parseAppleState,
  verifyAppleIdToken,
} from "@/server/auth/apple";
import { takeChallenge } from "@/server/auth/challenges";
import { clientIp, startSession } from "@/server/auth/current-user";
import { CHALLENGE_COOKIE, createLoginChallenge } from "@/server/auth/two-factor";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/services/audit";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Apple posts here (form_post) after the person approves. */
export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const go = (path: string) => NextResponse.redirect(new URL(path, origin), 303);
  const jar = await cookies();
  const cookieToken = jar.get(APPLE_STATE_COOKIE)?.value ?? "";
  jar.set(APPLE_STATE_COOKIE, "", { path: "/api/auth/apple", maxAge: 0, secure: true, sameSite: "none" });
  try {
    const cfg = appleConfig();
    if (!cfg) return go("/login?error=apple-unavailable");
    const db = getDb();
    const ip = await clientIp();
    if (!(await rateLimit(db, `apple-callback:ip:${ip}`, 30, 900)).allowed) return go("/login?error=rate-limited");
    const form = await req.formData();
    const field = (k: string) => {
      const v = form.get(k);
      return typeof v === "string" ? v.slice(0, 8000) : "";
    };
    if (field("error")) return go("/login"); // they cancelled on Apple's page
    const stateToken = field("state");
    // The state must be the one this browser started with (stops someone pushing their own Apple sign-in onto you).
    if (!stateToken || !cookieToken || !same(stateToken, cookieToken)) return go("/login?error=apple-expired");
    const ch = await takeChallenge(db, "apple", stateToken);
    if (!ch) return go("/login?error=apple-expired");
    const state = await parseAppleState(ch.challenge);
    const idToken = await exchangeAppleCode(cfg, field("code"));
    const claims = await verifyAppleIdToken(idToken, cfg, state.nonce);
    const outcome = await completeAppleSignIn(db, claims, { mode: state.mode, tz: state.tz, userId: ch.userId }, nameFromApple(field("user")));

    switch (outcome.kind) {
      case "linked":
        return go("/settings/security?apple=linked");
      case "link-required":
        jar.set(APPLE_LINK_COOKIE, outcome.pendingToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          expires: outcome.expiresAt,
        });
        return go(`/login?link=apple&email=${encodeURIComponent(outcome.email)}`);
      case "created":
        await startSession(outcome.userId);
        return go("/welcome");
      case "signed-in": {
        if (outcome.totpEnabled) {
          // Two-step sign-in still applies: the session starts only after the code.
          const { token, expiresAt } = await createLoginChallenge(db, outcome.userId);
          jar.set(CHALLENGE_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
          return go(state.next === "/" ? "/login/verify" : `/login/verify?next=${encodeURIComponent(state.next)}`);
        }
        await startSession(outcome.userId);
        await withUser(outcome.userId, (s) => audit(s, "user", "auth.login", undefined, { ip, method: "apple" }));
        return go(state.next);
      }
    }
  } catch (e) {
    if (e instanceof AppleSignInError) {
      console.warn("apple sign-in refused:", e.message);
      return go("/login?error=apple-failed");
    }
    console.error("apple sign-in error", e instanceof Error ? e.name : "unknown");
    return go("/login?error=apple-failed");
  }
}
