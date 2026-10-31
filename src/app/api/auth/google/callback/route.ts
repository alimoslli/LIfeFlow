import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { takeChallenge } from "@/server/auth/challenges";
import { clientIp } from "@/server/auth/current-user";
import {
  completeGoogleSignIn,
  exchangeGoogleSignInCode,
  GOOGLE_STATE_COOKIE,
  googleSignInConfig,
  GoogleSignInError,
  parseGoogleState,
  verifyGoogleIdToken,
} from "@/server/auth/google-signin";
import { finishOAuth } from "@/server/auth/oauth-finish";
import { getDb } from "@/server/db/client";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Google redirects here after the person picks an account. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const go = (path: string) => NextResponse.redirect(new URL(path, url.origin), 303);
  const jar = await cookies();
  const cookieToken = jar.get(GOOGLE_STATE_COOKIE)?.value ?? "";
  jar.set(GOOGLE_STATE_COOKIE, "", { path: "/api/auth/google", maxAge: 0 });
  try {
    const cfg = googleSignInConfig();
    if (!cfg) return go("/login?error=google-unavailable");
    const db = getDb();
    const ip = await clientIp();
    if (!(await rateLimit(db, `google-callback:ip:${ip}`, 30, 900)).allowed) return go("/login?error=rate-limited");
    const q = (k: string) => (url.searchParams.get(k) ?? "").slice(0, 4000);
    if (q("error")) return go("/login"); // they cancelled on Google's page
    const stateToken = q("state");
    // The state must be the one this browser started with (stops someone pushing their own Google sign-in onto you).
    if (!stateToken || !cookieToken || !same(stateToken, cookieToken)) return go("/login?error=google-expired");
    const ch = await takeChallenge(db, "google", stateToken);
    if (!ch) return go("/login?error=google-expired");
    const state = parseGoogleState(ch.challenge);
    const idToken = await exchangeGoogleSignInCode(cfg, q("code"), state.verifier);
    const { name, ...claims } = await verifyGoogleIdToken(idToken, cfg, state.nonce);
    const outcome = await completeGoogleSignIn(db, claims, { mode: state.mode, tz: state.tz, userId: ch.userId }, name);
    return finishOAuth(outcome, { provider: "google", next: state.next, origin: url.origin, ip });
  } catch (e) {
    console.warn("google sign-in refused:", e instanceof GoogleSignInError ? e.message : e instanceof Error ? e.name : "unknown");
    return go("/login?error=google-failed");
  }
}
