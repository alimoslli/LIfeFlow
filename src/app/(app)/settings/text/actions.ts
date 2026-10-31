"use server";
import { mutate, type ActionState } from "@/server/actions";
import { getDb } from "@/server/db/client";
import { setSms, startPhoneLink, unlinkPhone, verifyPhoneLink } from "@/server/services/sms";
import { isPro } from "@/server/billing";
import { ServiceError } from "@/server/services/errors";

const AT = { revalidate: ["/settings/text"] };

export async function startPhoneLinkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return mutate(
    "sms.code_sent",
    async (_s, u) => {
      if (!isPro(u)) throw new ServiceError("Texting is part of LifeFlow Pro. Upgrade in Settings → Plan.");
      return `Code sent to ${await startPhoneLink(getDb(), u.id, String(fd.get("phone") ?? ""))}.`;
    },
    AT,
  );
}

export async function verifyPhoneLinkAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  return mutate("sms.linked", async (_s, u) => `${await verifyPhoneLink(getDb(), u.id, String(fd.get("code") ?? ""))} is linked. Text away.`, AT);
}

export async function unlinkPhoneAction(): Promise<ActionState> {
  return mutate(
    "sms.unlinked",
    async (_s, u) => {
      await unlinkPhone(getDb(), u.id);
    },
    AT,
  );
}

export async function setSmsMoneyAction(on: boolean): Promise<ActionState> {
  return mutate(
    "sms.money",
    async (_s, u) => {
      await setSms(getDb(), u.id, { money: on });
    },
    AT,
  );
}
