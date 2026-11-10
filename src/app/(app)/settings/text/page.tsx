import type { Metadata } from "next";
import Link from "next/link";
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

export const metadata: Metadata = { title: "Text your skyling" };

/** Link a phone to text Jarvis: add the number, enter the code we text it. */
export default async function TextJarvisPage() {
  const cfg = smsConfig();
  if (!cfg) notFound();
  const u = await requireUser();
  const name = assistantProfile(u.preferences, u.timezone).name;
  const s = await smsStatus(getDb(), u.id);
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title={`Text ${name}`} />
      <p className="text-sm text-text-2">Text {name} to add a to-do, ask what&apos;s due or log a shift.</p>
      {s.phone ? (
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <p className="text-xs text-muted">Your number</p>
            <p className="text-[1.0625rem] font-medium">{s.phone}</p>
          </div>
          <div>
            <p className="text-xs text-muted">Text {name} at</p>
            <a href={`sms:${cfg.from}`} className="text-[1.0625rem] font-medium text-accent">
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
          <p className="text-xs leading-relaxed text-muted">
            By tapping Send code, you agree to get texts from LifeFlow: a sign-up code, and {name}&apos;s replies to the messages you send. Message frequency
            varies. Msg &amp; data rates may apply. Reply HELP for help or STOP to opt out at any time. See our{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </Card>
      )}
    </div>
  );
}
