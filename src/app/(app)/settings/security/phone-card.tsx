"use client";
import { useState, useTransition } from "react";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { toast } from "@/components/ui/toaster";
import { confirmLoginPhoneAction, removeLoginPhoneAction, startLoginPhoneAction } from "./phone-actions";

/** Settings: an optional phone number to sign in with. A code proves it (by text, or by email until texting is set up). */
export function PhoneCard({ masked, available, demo }: { masked: string | null; available: boolean; demo: boolean }) {
  const [pending, start] = useTransition();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);

  const send = () =>
    start(async () => {
      const r = await startLoginPhoneAction(phone);
      if (!r?.ok) return void toast(r?.error ?? "Couldn't send the code.", { tone: "danger" });
      setSent(true);
      if (r.message) toast(r.message);
    });
  const confirm = () =>
    start(async () => {
      const r = await confirmLoginPhoneAction(phone, code);
      if (!r?.ok) return void toast(r?.error ?? "That code didn't match.", { tone: "danger" });
      setSent(false);
      setPhone("");
      setCode("");
      if (r.message) toast(r.message);
    });
  const remove = () =>
    start(async () => {
      const r = await removeLoginPhoneAction();
      if (!r?.ok) return void toast(r?.error ?? "Couldn't remove it.", { tone: "danger" });
      if (r.message) toast(r.message);
    });

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">Sign in with your phone number</h2>
          <p className="mt-0.5 text-sm text-text-2">
            Optional. We send a 6-digit code to your number and you&apos;re in.
            {available ? "" : " This isn't available yet."}
          </p>
        </div>
      </div>
      {masked ? (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="text-[0.9375rem]">
            <span className="text-text-2">Signs in with </span>
            <span className="font-medium">{masked}</span>
          </p>
          <Button variant="ghost" onClick={remove} disabled={pending || demo}>
            Remove
          </Button>
        </div>
      ) : available && !demo ? (
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-2">Mobile number</span>
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(404) 555-0134"
              disabled={sent}
            />
          </label>
          {sent && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-text-2">Code we sent</span>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
              />
            </label>
          )}
          {sent ? (
            <div className="flex gap-2">
              <Button onClick={confirm} loading={pending} disabled={code.replace(/\s/g, "").length !== 6}>
                Confirm number
              </Button>
              <Button variant="ghost" onClick={() => setSent(false)} disabled={pending}>
                Change number
              </Button>
            </div>
          ) : (
            <Button onClick={send} loading={pending} disabled={phone.replace(/\D/g, "").length < 10} className="self-start">
              Send me a code
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}
