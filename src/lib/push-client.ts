/**
 * Push notifications on this device, shared by Settings › Notifications and the calm ask (components/jarvis/notify-ask.tsx).
 * Browser only. Never throws from `pushState`; `turnOnPush` returns a plain-words error instead of throwing.
 */
export type PushState = "unavailable" | "unsupported" | "needs-install" | "denied" | "off" | "on";

export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
export const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

export function deviceLabel() {
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

/** Registered by PwaClient in production builds; `ready` would wait forever without one. */
export async function pushRegistration() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? null;
}

async function publicKey(): Promise<string | null> {
  try {
    const res = await fetch("/api/push/subscribe");
    return ((await res.json()) as { publicKey: string | null }).publicKey;
  } catch {
    return null;
  }
}

/** Where this device stands. `unavailable`: the server can't send any yet. */
export async function pushState(): Promise<PushState> {
  try {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window))
      return isIOS() && !standalone() ? "needs-install" : "unsupported";
    if (!(await publicKey())) return "unavailable";
    if (Notification.permission === "denied") return "denied";
    const sub = await (await pushRegistration())?.pushManager.getSubscription();
    return sub && Notification.permission === "granted" ? "on" : "off";
  } catch {
    return "unsupported";
  }
}

async function saveOnServer(sub: PushSubscription) {
  const json = sub.toJSON();
  return fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, deviceLabel: deviceLabel() }),
  });
}

/** Asks the browser, subscribes and saves it. A browser that was linked to another account gets a fresh subscription. */
export async function turnOnPush(): Promise<{ ok: true } | { ok: false; state?: PushState; error?: string }> {
  try {
    const key = await publicKey();
    if (!key) return { ok: false, error: "Notifications aren't available yet." };
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return { ok: false, state: permission === "denied" ? "denied" : "off" };
    const reg = await pushRegistration();
    if (!reg) return { ok: false, error: "Open LifeFlow again and retry (the app is still installing its offline files)." };
    let sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }));
    let res = await saveOnServer(sub);
    if (res.status === 409) {
      await sub.unsubscribe();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
      res = await saveOnServer(sub);
    }
    if (!res.ok) return { ok: false, error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't turn notifications on." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't turn notifications on." };
  }
}
