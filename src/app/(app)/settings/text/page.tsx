import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { assistantProfile } from "@/lib/assistant";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { smsConfig } from "@/server/integrations/twilio";
import { smsStatus } from "@/server/services/sms";
import { SettingsHeader } from "../settings-header";
import { setSmsMoneyAction, startPhoneLinkAction, unlinkPhoneAction, verifyPhoneLinkAction } from "./actions";

export const metadata: Metadata = { title: "Text Jarvis" };

/** Link a phone to text Jarvis: add the number, enter the code we text it. */
export default async function TextJarvisPage() {
  const cfg = smsConfig();
  if (!cfg) notFound();
  const u = await requireUser();
  const name = assistantProfile(u.preferences).name;
  const s = await smsStatus(getDb(), u.id);
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title={`Text ${name}`} />
      <p className="text-sm text-text-2">
        Text {name} from your phone like a friend: add a to-do, ask what&apos;s due, log a shift. Anything important still asks you first.
      </p>
      {s.phone ? (
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-xs text-muted">Your number</p>
            <p className="text-[17px] font-medium">{s.phone}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Text {name} at</p>
            <a href={`sms:${cfg.from}`} className="text-[17px] font-medium text-accent">
              {cfg.from}
            </a>
          </div>
          <ActionButton
            action={setSmsMoneyAction.bind(null, !s.money)}
            className="flex min-h-11 items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 text-left text-sm"
          >
            <span>
              <span className="block font-medium">Money details by text</span>
              <span className="text-xs text-muted">Texts can show on your lock screen. Off keeps balances and spending out of texts.</span>
            </span>
            <span className={s.money ? "font-medium text-accent" : "text-muted"}>{s.money ? "On" : "Off"}</span>
          </ActionButton>
          <ActionButton
            action={unlinkPhoneAction}
            confirm="Stop texting with this number?"
            className="flex min-h-11 items-center self-start text-sm text-danger"
          >
            Remove this number
          </ActionButton>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 p-5">
          <ActionForm action={startPhoneLinkAction} className="flex-row items-end gap-2">
            <Field label="Your mobile number" htmlFor="sms-phone" className="flex-1">
              <Input id="sms-phone" name="phone" type="tel" autoComplete="tel" required placeholder="(404) 555-0134" className="h-11" />
            </Field>
            <SubmitButton className="min-h-11">Send code</SubmitButton>
          </ActionForm>
          {s.pendingPhone && (
            <ActionForm action={verifyPhoneLinkAction} className="flex-row items-end gap-2">
              <Field label={`Code sent to ${s.pendingPhone}`} htmlFor="sms-code" className="flex-1">
                <Input id="sms-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className="h-11" />
              </Field>
              <SubmitButton className="min-h-11">Verify</SubmitButton>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
