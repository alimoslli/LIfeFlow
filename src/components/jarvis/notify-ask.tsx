"use client";
import { useEffect, useState } from "react";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { toast } from "@/components/ui/toaster";
import { pushState, turnOnPush, type PushState } from "@/lib/push-client";

const KEY = "lf_notify_ask";
type Seen = { n: number; no?: boolean };
const read = (): Seen => {
  try {
    return { n: 0, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Seen>) };
  } catch {
    return { n: 0 };
  }
};
const write = (s: Seen) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
};

/** Whether the calm ask may be shown on this device now: not declined, not shown twice, and they can come but are off. */
export async function notifyAskDue(): Promise<"off" | "needs-install" | null> {
  const seen = read();
  if (seen.no || seen.n >= 2) return null;
  const s = await pushState();
  return s === "off" || s === "needs-install" ? s : null;
}
/** The ask was shown once more on this device. */
export const notifyAskShown = () => write({ ...read(), n: read().n + 1 });
/** "Not now": never asked again on this device (Settings › Notifications still has them). */
export const notifyAskNo = () => write({ ...read(), no: true });

/**
 * The calm ask for notifications (owner's program, item 3, 2026-11-10): the only other place to turn them on is Settings ›
 * Notifications. Shown at most twice on this device, "Not now" is remembered, and never when they're on, blocked, or
 * the server can't send any. On an iPhone outside the installed app it says the one step first (Share, then Add to Home
 * Screen), because Safari can't receive them there. Notifications are per device, so this is remembered per device.
 */
export function NotifyAsk({ title, line }: { title: string; line: string }) {
  const [state, setState] = useState<PushState | null>(null);
  const [gone, setGone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void notifyAskDue().then((s) => {
      if (!alive || !s) return;
      notifyAskShown();
      setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!state || gone) return null;
  const notNow = () => {
    notifyAskNo();
    setGone(true);
  };
  const on = async () => {
    setBusy(true);
    const r = await turnOnPush();
    setBusy(false);
    if (r.ok) {
      toast("Notifications are on for this device.");
      setGone(true);
    } else if (r.state === "denied") {
      toast("They're blocked for LifeFlow in this browser's settings.", { tone: "danger" });
      setGone(true);
    } else if (r.error) toast(r.error, { tone: "danger" });
  };
  return (
    <section aria-label="Notifications" className="flex items-start gap-3 rounded-[1.25rem] bg-surface p-4 shadow-soft ring-1 ring-border/60">
      <PixelIcon name="bell" className="mt-0.5 h-7 w-7" />
      <div className="min-w-0 flex-1">
        <p className="text-[0.9375rem] font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-text-2">
          {state === "needs-install" ? "On iPhone they need LifeFlow on your Home Screen: tap Share, then Add to Home Screen, and open it from there." : line}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {state === "off" && (
            <button type="button" onClick={on} disabled={busy} className="lf-sb lf-sb-sun lf-sb-sm">
              Turn on
            </button>
          )}
          {/* "Got it" only hides it: once LifeFlow is on the Home Screen, it may ask there */}
          <button type="button" onClick={state === "needs-install" ? () => setGone(true) : notNow} className="lf-sb lf-sb-app lf-sb-sm">
            {state === "needs-install" ? "Got it" : "Not now"}
          </button>
        </div>
      </div>
    </section>
  );
}
