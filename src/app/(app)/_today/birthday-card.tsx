"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Cake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { AGE_LINE } from "@/lib/birthday";
import { saveBirthdayAction } from "./actions";

/**
 * Asked once on Today from accounts made before the birthday was required (owner, 2026-11-10): small, on the first
 * screen, and not a lockout. A neutral question; the age rule is the server's.
 */
export function BirthdayCard({ blocked }: { blocked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(blocked ? AGE_LINE : null);
  const locked = error === AGE_LINE;
  return (
    <section aria-label="Your birthday" className="flex flex-col gap-3 rounded-3xl bg-surface px-5 py-4 shadow-soft">
      <p className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Cake className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[0.9375rem] font-medium">{locked ? AGE_LINE : "When's your birthday?"}</span>
          {!locked && <span className="block text-sm text-muted">One quick thing we ask everyone. Private to your account.</span>}
        </span>
      </p>
      {!locked && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await saveBirthdayAction(date);
              if (r?.ok) router.refresh();
              else setError(r?.error ?? "Couldn't save. Try again.");
            });
          }}
        >
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Your birthday"
            autoComplete="bday"
            className="min-h-11 min-w-0 flex-1"
            required
          />
          <Button type="submit" loading={pending} disabled={!date} className="min-h-11">
            Save
          </Button>
        </form>
      )}
      {error && !locked && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
