"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { mutate, type ActionState } from "@/server/actions";
import { AppleSignInError, unlinkApple } from "@/server/auth/apple";
import { moneyLocked } from "@/server/auth/money-lock";
import { listPasskeys, PasskeyError, removePasskey, renamePasskey } from "@/server/auth/passkeys";
import { SESSION_COOKIE, setMoneyUnlockedAt } from "@/server/auth/sessions";
import { getDb } from "@/server/db/client";
import { updatePreferences } from "@/server/services/accounts";
import { ServiceError } from "@/server/services/errors";
import { MONEY_LOCK_IDLE_CHOICES } from "@/server/auth/money-lock";

const asService = async <T>(fn: () => Promise<T>) => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof PasskeyError || e instanceof AppleSignInError) throw new ServiceError(e.message);
    throw e;
  }
};

const REVALIDATE = { revalidate: ["/settings/security"] };

export async function renamePasskeyAction(id: string, _p: ActionState, fd: FormData): Promise<ActionState> {
  return mutate(
    "auth.passkey_renamed",
    async (_s, u) => {
      await asService(() => renamePasskey(getDb(), u.id, id, String(fd.get("name") ?? "")));
      return "Passkey renamed.";
    },
    REVALIDATE,
  );
}

export async function removePasskeyAction(id: string): Promise<ActionState> {
  return mutate(
    "auth.passkey_removed",
    async (_s, u) => {
      // While Money is locked, the lock can't be undone by removing the passkey that guards it.
      if (await moneyLocked(u)) throw new ServiceError("Unlock Money with Face ID first, then remove the passkey.");
      const name = await asService(() => removePasskey(getDb(), u.id, id));
      if (!(await listPasskeys(getDb(), u.id)).length && u.preferences?.moneyLock?.enabled) {
        await updatePreferences(getDb(), u.id, { moneyLock: { enabled: false, idleMinutes: u.preferences.moneyLock.idleMinutes } });
        return `Removed "${name}". The Money lock was turned off because it needs a passkey.`;
      }
      return `Removed "${name}". It can't be used to sign in anymore.`;
    },
    REVALIDATE,
  );
}

export async function setMoneyLockAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const enabled = fd.get("enabled") === "on";
  const idle = z.coerce
    .number()
    .refine((n) => (MONEY_LOCK_IDLE_CHOICES as readonly number[]).includes(n))
    .catch(5)
    .parse(fd.get("idleMinutes"));
  return mutate(
    "money.lock_settings",
    async (_s, u) => {
      const was = u.preferences?.moneyLock?.enabled === true;
      if (enabled && !(await listPasskeys(getDb(), u.id)).length) throw new ServiceError("Add a passkey (Face ID or Touch ID) first. The lock uses it.");
      if (was && !enabled && (await moneyLocked(u))) throw new ServiceError("Unlock Money with Face ID first, then turn the lock off.");
      await updatePreferences(getDb(), u.id, { moneyLock: { enabled, idleMinutes: idle } });
      // Turning it on counts as an unlock for this session, so it doesn't lock the moment it's saved.
      if (enabled && !was) await setMoneyUnlockedAt(getDb(), (await cookies()).get(SESSION_COOKIE)?.value ?? "", new Date());
      return enabled ? `Money locks after ${idle} minute${idle === 1 ? "" : "s"} without use.` : "Money lock is off.";
    },
    REVALIDATE,
  );
}

export async function unlinkAppleAction(): Promise<ActionState> {
  return mutate(
    "auth.apple_unlinked",
    async (_s, u) => {
      await asService(() => unlinkApple(getDb(), u.id));
      return "Sign in with Apple was unlinked.";
    },
    REVALIDATE,
  );
}
