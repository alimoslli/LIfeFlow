"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CloudOff, Download, Share, X } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { toast } from "@/components/ui/toaster";
import { flush, pending } from "@/lib/offline-queue";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS/.test(navigator.userAgent);

/**
 * Everything that makes the web app behave like an installed one:
 * service worker, offline banner + queued changes, and the install prompt.
 */
export function PwaClient() {
  const router = useRouter();
  const [offline, setOffline] = useState(false);
  const [queued, setQueued] = useState(0);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [iosSheet, setIosSheet] = useState(false);

  const sync = async () => {
    const r = await flush();
    if (r.applied) {
      toast(`Synced ${r.applied} change${r.applied === 1 ? "" : "s"} you made offline.`);
      router.refresh();
    }
    if (r.failed) toast(`${r.failed} offline change${r.failed === 1 ? "" : "s"} couldn't be saved.`, { tone: "danger" });
    setQueued((await pending()).length);
  };

  // Service worker (production builds only, so development reloads stay simple).
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    const onMsg = (e: MessageEvent) => e.data?.type === "flush-offline-queue" && void sync();
    navigator.serviceWorker.addEventListener("message", onMsg);
    return () => navigator.serviceWorker.removeEventListener("message", onMsg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Online / offline, and the queue of changes waiting to sync.
  useEffect(() => {
    const update = async () => {
      setOffline(!navigator.onLine);
      setQueued((await pending()).length);
    };
    const online = () => {
      setOffline(false);
      void sync();
    };
    const off = () => setOffline(true);
    const t = setTimeout(() => {
      void update();
      if (navigator.onLine) void sync();
    }, 0);
    window.addEventListener("online", online);
    window.addEventListener("offline", off);
    window.addEventListener("lf:queue-changed", update);
    return () => {
      clearTimeout(t);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", off);
      window.removeEventListener("lf:queue-changed", update);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Install prompt: offered from the second visit, never in the installed app, and never again once dismissed.
  useEffect(() => {
    let visits = 0;
    let dismissed = false;
    let automated = navigator.webdriver; // keeps it out of the way in automated tests unless a test asks for it
    try {
      visits = Number(localStorage.getItem("lf-visits") ?? "0") + 1;
      localStorage.setItem("lf-visits", String(visits));
      dismissed = localStorage.getItem("lf-install-dismissed") === "1";
      if (localStorage.getItem("lf-install-test") === "1") automated = false;
    } catch {}
    if (standalone() || dismissed || automated || visits < 2) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallPrompt);
      setShowInstall(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const t = setTimeout(() => isIOS() && setShowInstall(true), 1500);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    setShowInstall(false);
    try {
      localStorage.setItem("lf-install-dismissed", "1");
    } catch {}
  };

  return (
    <>
      {(offline || queued > 0) && (
        <div role="status" className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+52px)] z-40 flex justify-center px-4 md:top-4">
          <span className="flex items-center gap-2 rounded-full bg-text px-4 py-2 text-sm text-bg shadow-lift">
            <CloudOff className="h-4 w-4" />
            {offline ? "You're offline. Changes save on this phone." : `Syncing ${queued} change${queued === 1 ? "" : "s"}…`}
            {offline && queued > 0 && <span className="opacity-75">· {queued} waiting</span>}
          </span>
        </div>
      )}

      {showInstall && (
        <div className="fixed inset-x-3 bottom-[calc(var(--tabbar-space)+8px)] z-30 mx-auto max-w-md rounded-3xl bg-surface p-4 shadow-lift md:bottom-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <Download className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Add LifeFlow to your home screen</p>
              <p className="mt-0.5 text-sm text-text-2">Opens full screen like an app, works offline, and can send reminders.</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-accent-text"
                  onClick={async () => {
                    if (install) {
                      await install.prompt();
                      const choice = await install.userChoice;
                      if (choice.outcome === "accepted") setShowInstall(false);
                    } else setIosSheet(true);
                  }}
                >
                  {install ? "Install" : "Show me how"}
                </button>
                <button type="button" onClick={dismiss} className="min-h-11 rounded-full px-4 text-sm text-muted">
                  Not now
                </button>
              </div>
            </div>
            <button type="button" onClick={dismiss} aria-label="Close" className="tap -m-2 flex items-center justify-center text-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <Sheet open={iosSheet} onClose={() => setIosSheet(false)} title="Add to Home Screen">
        <ol className="flex flex-col gap-3 text-[15px]">
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">1</span>
            <span>
              In Safari, tap the Share button <Share className="inline h-4 w-4 align-[-2px]" aria-label="Share" /> at the bottom of the screen.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">2</span>
            <span>Scroll down and tap &quot;Add to Home Screen&quot;.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">3</span>
            <span>Tap &quot;Add&quot;. Open LifeFlow from the new icon, then turn on notifications in Settings.</span>
          </li>
        </ol>
        <p className="mt-4 text-sm text-muted">Notifications on iPhone need iOS 16.4 or later and work only from the home-screen app.</p>
      </Sheet>
    </>
  );
}

/**
 * Before signing out: stops notifications for this account on this device and
 * clears everything saved for offline use, so the next person sees nothing.
 */
export async function clearOfflineData() {
  try {
    const sub = await (await navigator.serviceWorker?.getRegistration("/"))?.pushManager?.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => undefined);
      await sub.unsubscribe();
    }
  } catch {}
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "clear-user-data" });
    indexedDB.deleteDatabase("lifeflow-offline");
    localStorage.removeItem("lf-quick-add");
  } catch {}
}
