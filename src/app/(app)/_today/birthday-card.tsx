"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { saveBirthdayAction } from "./actions";
import { PixelIcon } from "@/components/pixel/pixel-icon";

/**
 * Asked once on Today from accounts made before the birthday was required (owner, 2026-11-10): small, on the first
 * screen. A neutral question; the age rule is the server's. Under 13 here would lock the account and erase everything in
 * it, so the date is read back first and nothing happens until they say it's right (owner, 2026-11-10: confirm, then erase).
 */
const spoken = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

export function BirthdayCard() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const send = (confirmed: boolean) =>
    start(async () => {
      const r = await saveBirthdayAction(confirm ?? date, confirmed);
      if (r && "confirm" in r && r.confirm) {
        setError(null);
        setConfirm(r.confirm);
      } else if (r?.ok) router.refresh();
      else setError((r && "error" in r && r.error) || "Couldn't save. Try again.");
    });
  if (confirm)
    return (
      <section aria-label="Your birthday" className="flex flex-col gap-3 rounded-3xl bg-surface px-5 py-4 shadow-soft">
        <p className="text-[0.9375rem] font-medium">You entered {spoken(confirm)}.</p>
        <p className="text-sm text-muted">
          LifeFlow is for people 13 and older, so this account will be locked and everything in it erased. This can&apos;t be undone.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" className="min-h-11" disabled={pending} onClick={() => setConfirm(null)}>
            Change the date
          </Button>
          <Button type="button" variant="danger" className="min-h-11" loading={pending} onClick={() => send(true)}>
            Yes, that&apos;s right
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </section>
    );
  return (
    <section aria-label="Your birthday" className="flex flex-col gap-3 rounded-3xl bg-surface px-5 py-4 shadow-soft">
      <p className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <PixelIcon name="gift" className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">When&apos;s your birthday?</span>
          <span className="block text-sm text-muted">One quick thing we ask everyone. Private to your account.</span>
        </span>
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(false);
        }}
      >
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Your birthday"
          autoComplete="bday"
          max={new Date().toISOString().slice(0, 10)}
          className="min-h-11 min-w-0 flex-1"
          required
        />
        <Button type="submit" loading={pending} disabled={!date} className="min-h-11">
          Save
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
