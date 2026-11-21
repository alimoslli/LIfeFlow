"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BirthdayField } from "@/components/ui/birthday-field";
import { saveWaitlistBirthday } from "./actions";

const spoken = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

/**
 * The first thing on the waitlist when no birthday is saved yet (owner, 2026-11-21): one neutral question, on the night like
 * the rest of the page. The age rule is the server's. An account that had finished setup before is read the date back
 * before an under-13 answer locks it (the same as Today's card); a new account is locked at once, as setup did.
 */
export function WaitlistBirthday({ className }: { className: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const send = (confirmed: boolean) =>
    start(async () => {
      const r = await saveWaitlistBirthday(confirm ?? date, confirmed);
      if (r?.confirm) {
        setError(null);
        setConfirm(r.confirm);
      } else if (r?.ok) router.refresh();
      else setError(r?.error || "Couldn't save. Try again.");
    });

  return (
    <section className={`${className} wl-birthday`} aria-labelledby="wl-birthday">
      <h2 id="wl-birthday" className="font-display text-[1.5rem] leading-[1.1] font-medium tracking-[-0.03em]">
        {confirm ? `You entered ${spoken(confirm)}.` : "First, when's your birthday?"}
      </h2>
      {confirm ? (
        <>
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            LifeFlow is for people 13 and older, so this account will be locked and everything in it erased. This can&apos;t be undone.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => setConfirm(null)} className="lf-sb lf-sb-glass lf-sb-sm min-h-11">
              Change the date
            </button>
            <button type="button" disabled={pending} onClick={() => send(true)} className="lf-sb lf-sb-glass lf-sb-sm min-h-11 disabled:opacity-60">
              Yes, that&apos;s right
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm leading-relaxed text-white/70">One quick thing we ask everyone. It stays private to your account.</p>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"
            onSubmit={(e) => {
              e.preventDefault();
              send(false);
            }}
          >
            <BirthdayField value={date} onChange={setDate} className="min-w-0 flex-1 grid-cols-[1.25fr_1fr_1.1fr]" />
            <button type="submit" disabled={!date || pending} className="lf-sb lf-sb-sun lf-sb-sm min-h-11 disabled:opacity-60">
              Save
            </button>
          </form>
        </>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-star-gold">
          {error}
        </p>
      )}
    </section>
  );
}
