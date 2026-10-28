"use client";
import { useState, useTransition } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { Markdown } from "@/components/jarvis/markdown";
import { Sheet } from "@/components/ui/sheet";
import { cancelHelpAction } from "./actions";

type Help = { answer: string; sources: { title: string; url: string }[] } | null;

const VIA = {
  apple: ["It's billed through Apple.", "On iPhone: Settings, tap your name, Subscriptions, choose it, then Cancel Subscription."],
  google_play: [
    "It's billed through Google Play.",
    "Open the Play Store app, tap your profile picture, Payments & subscriptions, Subscriptions, choose it, then Cancel.",
  ],
  paypal: [
    "It's paid through PayPal.",
    "Cancel it on the service's own site first. In PayPal you can also stop it under Settings, Payments, Manage automatic payments.",
  ],
} as const;

/** Step-by-step cancellation help. Jarvis never cancels anything himself. */
export function CancelHelp({ id, name, via, saved }: { id: string; name: string; via: keyof typeof VIA | null; saved: Help }) {
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState<Help>(saved);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const find = () =>
    start(async () => {
      setError(null);
      const r = await cancelHelpAction(id);
      if (r.ok) setHelp({ answer: r.answer, sources: r.sources });
      else setError(r.error);
    });
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 rounded-full bg-surface-2 px-4 text-sm font-medium">
        Cancel help
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`Cancel ${name}`}>
        <div className="flex flex-col gap-4 text-[15px]">
          {via ? (
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="font-medium">{VIA[via][0]}</p>
              <p className="mt-1 text-text-2">{VIA[via][1]}</p>
            </div>
          ) : (
            <p className="text-text-2">
              Most services cancel from your account page on their website: sign in, open Account or Subscription, then Cancel. If you signed up in an app,
              cancel in the App Store or Google Play instead.
            </p>
          )}
          {help ? (
            <div className="rounded-2xl bg-surface-2 p-4">
              <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">From the web, just now</p>
              <Markdown text={help.answer} />
              {help.sources.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1">
                  {help.sources.slice(0, 4).map((s) => (
                    <li key={s.url}>
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-accent"
                      >
                        <ExternalLink className="h-4 w-4" /> {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={find}
              disabled={pending}
              className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-accent px-5 font-medium text-accent-text disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Find the official steps
            </button>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <p className="text-xs text-muted">
            Jarvis never cancels anything for you. After you cancel, tap &quot;I cancelled it&quot; so the totals stay right.
          </p>
        </div>
      </Sheet>
    </>
  );
}
