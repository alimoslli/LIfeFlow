"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
// the same push code as the calm ask in the chat (lib/push-client.ts), so a fix lands once
import { pushRegistration, pushState, turnOnPush } from "@/lib/push-client";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

/** Turns push notifications on or off for the phone or browser you're using. */
export function ThisDevice({ available }: { available: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // "unavailable" (the server can't send yet) is shown from the page's own `available`
      const next = await pushState();
      if (alive) setState(next === "unavailable" ? "off" : next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const r = await turnOnPush();
      if (!r.ok) {
        if (r.state) setState(r.state === "unavailable" ? "off" : r.state);
        if (r.error) toast(r.error, { tone: "danger" });
        return;
      }
      setState("on");
      toast("Notifications are on for this device.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const sub = await (await pushRegistration())?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
      toast("Notifications are off for this device.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't send a test.");
      toast("Test sent. It should appear in a few seconds.");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send a test.", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  if (!available)
    return (
      <p className="text-sm text-text-2" data-testid="push-state">
        Notifications aren&apos;t available yet. Check back soon.
      </p>
    );

  return (
    <div data-testid="push-state" data-state={state}>
      {state === "loading" && <p className="text-sm text-muted">Checking…</p>}
      {state === "needs-install" && (
        <p className="text-sm text-text-2">
          On iPhone, notifications work from the home-screen app (iOS 16.4 or later). In Safari, tap Share, then &quot;Add to Home Screen&quot;, open LifeFlow
          from the new icon and come back here.
        </p>
      )}
      {state === "unsupported" && <p className="text-sm text-text-2">This browser can&apos;t receive notifications. Try Chrome, Edge, Firefox or Safari.</p>}
      {state === "denied" && (
        <p className="text-sm text-text-2">
          Notifications are blocked for LifeFlow. Allow them in your browser or phone settings (Settings, Notifications, LifeFlow on iPhone), then reload this
          page.
        </p>
      )}
      {state === "off" && (
        <>
          <p className="mb-3 text-sm text-text-2">Get reminders, bills, budget alerts and your morning brief on this device.</p>
          <Button onClick={turnOn} loading={busy} className="min-h-11">
            <Bell className="h-4 w-4" /> Turn on notifications
          </Button>
        </>
      )}
      {state === "on" && (
        <>
          <p className="mb-3 text-sm text-success">Notifications are on for this device.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={test} loading={busy} variant="secondary" className="min-h-11">
              Send a test
            </Button>
            <Button onClick={turnOff} disabled={busy} variant="ghost" className="min-h-11">
              <BellOff className="h-4 w-4" /> Turn off here
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
