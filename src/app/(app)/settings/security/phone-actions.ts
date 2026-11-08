"use server";
import { mutate, type ActionState } from "@/server/actions";
import { confirmAddLoginPhone, removeLoginPhone, startAddLoginPhone } from "@/server/auth/phone-login";
import { getDb } from "@/server/db/client";

const REVALIDATE = { revalidate: ["/settings/security"] };

/** Sends a code to a number the person wants to sign in with (a text, or an email to this account until texting is set up). */
export async function startLoginPhoneAction(phone: string): Promise<ActionState> {
  return mutate(
    "auth.login_phone_code",
    async (_s, u) => {
      const r = await startAddLoginPhone(getDb(), u.id, phone);
      return r.via === "text" ? "We texted you a code." : "We emailed you a code, since texting isn't set up yet.";
    },
    undefined,
  );
}

export async function confirmLoginPhoneAction(phone: string, code: string): Promise<ActionState> {
  return mutate(
    "auth.login_phone_added",
    async (_s, u) => {
      await confirmAddLoginPhone(getDb(), u.id, phone, code);
      return "Done. You can now sign in with this number.";
    },
    REVALIDATE,
  );
}

export async function removeLoginPhoneAction(): Promise<ActionState> {
  return mutate(
    "auth.login_phone_removed",
    async (_s, u) => {
      await removeLoginPhone(getDb(), u.id);
      return "Phone number removed. It can't be used to sign in anymore.";
    },
    REVALIDATE,
  );
}
