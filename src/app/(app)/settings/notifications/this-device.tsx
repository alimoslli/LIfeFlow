"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function deviceLabel() {
  const ua = navigator.userAgent;
  const device = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android phone"
        : /Mac/.test(ua)
          ? "Mac"
          : /Windows/.test(ua)
            ? "Windows PC"
            : "Computer";
  const browser = standalone()
    ? "app"
    : /Edg\//.test(ua)
      ? "Edge"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "browser";
  return `${device} (${browser})`;
}

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function registration() {
  // Registered by PwaClient in production builds; `ready` would wait forever without one.
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

async function saveOnServer(sub: PushSubscription) {
  const json = sub.toJSON();
  return fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, deviceLabel: deviceLabel() }),
  });
}

/** Turns push notifications on or off for the phone or browser you're using. */
export function ThisDevice({ available }: { available: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      let next: State;
      if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window))
        next = isIOS() && !standalone() ? "needs-install" : "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const sub = await (await registration())?.pushManager.getSubscription();
        next = sub && Notification.permission === "granted" ? "on" : "off";
      }
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    try {
      const keyRes = await fetch("/api/push/subscribe");
      const { publicKey } = (await keyRes.json()) as { publicKey: string | null };
      if (!publicKey) throw new Error("Notifications aren't available yet.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      if (!reg) throw new Error("Open LifeFlow again and retry (the app is still installing its offline files).");
      let sub =
        (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      let res = await saveOnServer(sub);
      if (res.status === 409) {
        // This browser was still linked to another account: start a fresh subscription for this one.
        await sub.unsubscribe();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        res = await saveOnServer(sub);
      }
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't turn notifications on.");
      setState("on");
      toast("Notifications are on for this device.");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't turn notifications on.", { tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const sub = await (await registration())?.pushManager.getSubscription();
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
