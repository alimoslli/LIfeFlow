"use server";
import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/current-user";
import { beginTotpSetup, confirmTotpSetup, disableTwoFactor, regenerateRecoveryCodes, TwoFactorError } from "@/server/auth/two-factor";
import { getDb } from "@/server/db/client";
import { withUser } from "@/server/db/with-user";
import { rateLimit } from "@/server/rate-limit";
import { audit } from "@/server/services/audit";

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

/** Runs a two-factor change for the signed-in user with a per-user attempt limit and an audit entry. */
async function guarded<T>(event: string, fn: (userId: string) => Promise<T>): Promise<Result<T>> {
  const user = await requireUser();
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
