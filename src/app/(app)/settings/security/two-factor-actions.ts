"use server";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { requireUser } from "@/server/auth/current-user";
import { emailConfig, sendEmail } from "@/server/integrations/email";
import { createHash } from "node:crypto";
import { SESSION_COOKIE } from "@/server/auth/sessions";
import {
  beginTotpSetup,
  beginTwoFactorRestart,
  confirmTotpSetup,
  disableTwoFactor,
  finishTwoFactorRestart,
  regenerateRecoveryCodes,
  TwoFactorError,
} from "@/server/auth/two-factor";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/services/audit";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Runs a two-factor change for the signed-in user with a per-user attempt limit and an audit entry. */
async function guarded<T>(event: string, fn: (userId: string) => Promise<T>): Promise<Result<T>> {
  const user = await requireUser({ account: true });
  const limit = await rateLimit(getDb(), `mfa-settings:${user.id}`, 10, 900);
  if (!limit.allowed) return { ok: false, error: "Too many attempts. Please wait a few minutes." };
  try {
    const data = await fn(user.id);
    await withUser(user.id, (s) => audit(s, "user", event));
    revalidatePath("/settings/security");
    return { ok: true, ...data };
  } catch (e) {
    if (e instanceof TwoFactorError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function startTwoFactorSetup() {
  return guarded("auth.2fa.setup_started", async (userId) => {
    const { secret, uri } = await beginTotpSetup(getDb(), userId);
    const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return { secret, qr: `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}` };
  });
}

export async function confirmTwoFactorSetup(code: string) {
  return guarded("auth.2fa.enabled", (userId) => confirmTotpSetup(getDb(), userId, String(code).slice(0, 10)));
}

export async function turnOffTwoFactor(password: string, code: string) {
  return guarded("auth.2fa.disabled", async (userId) => {
    await disableTwoFactor(getDb(), userId, String(password).slice(0, 200), String(code).slice(0, 40));
    return {};
  });
}

export async function newRecoveryCodes(code: string) {
  return guarded("auth.2fa.recovery_codes_regenerated", async (userId) => ({
    recoveryCodes: await regenerateRecoveryCodes(getDb(), userId, String(code).slice(0, 40)),
  }));
}

const RESTART_COOKIE = "bf_2fa_restart";

/** "Lost your app? Start over": checks the password and emails a 6-digit code. */
export async function emailRestartCode(password: string) {
  return guarded("auth.2fa.restart_code_sent", async (userId) => {
    const cfg = emailConfig();
    if (!cfg) throw new TwoFactorError("Email codes aren't available yet.");
    const r = await beginTwoFactorRestart(getDb(), userId, String(password).slice(0, 200));
    try {
      await sendEmail(cfg, {
        to: r.email,
        subject: `${r.code} is your code to reset two-step sign-in`,
        text: `Your code to reset two-step sign-in on LifeFlow is ${r.code}.\n\nIt works once, for 10 minutes. If you didn't ask for this, change your password.`,
        html: `<p>Your code to reset two-step sign-in on LifeFlow is</p><p style="font-size:28px;font-weight:600;letter-spacing:4px">${r.code}</p><p>It works once, for 10 minutes. If you didn't ask for this, change your password.</p>`,
      });
    } catch {
      throw new TwoFactorError("We couldn't send the email just now. Try again in a minute.");
    }
    (await cookies()).set(RESTART_COOKIE, r.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/settings/security",
      expires: r.expiresAt,
    });
    return { sentTo: r.to };
  });
}

/** Second step: the emailed code resets two-step sign-in, so a new app and new backup codes can be set up. */
export async function finishRestart(code: string) {
  return guarded("auth.2fa.reset_by_email", async (userId) => {
    const jar = await cookies();
    const own = jar.get(SESSION_COOKIE)?.value;
    const keep = own ? createHash("sha256").update(own).digest("hex") : null;
    await finishTwoFactorRestart(getDb(), userId, jar.get(RESTART_COOKIE)?.value ?? "", String(code).slice(0, 40), keep);
    jar.delete({ name: RESTART_COOKIE, path: "/settings/security" });
    const user = await requireUser({ account: true });
    const cfg = emailConfig();
    if (cfg)
      after(() =>
        sendEmail(cfg, {
          to: user.email,
          subject: "Two-step sign-in on LifeFlow was reset",
          text: "Two-step sign-in on your LifeFlow account was reset with an email code. Set it up again in Settings, Security. If this wasn't you, change your password now.",
          html: "<p>Two-step sign-in on your LifeFlow account was reset with an email code. Set it up again in Settings, Security.</p><p>If this wasn't you, change your password now.</p>",
        }).catch(() => {}),
      );
    return {};
  });
}
