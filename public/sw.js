/* LifeFlow service worker: app-shell caching, offline reading, push notifications. */
const VERSION = "lf-v2";
const SHELL = `${VERSION}-shell`;
const PAGES = `${VERSION}-pages`;
const STATIC = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
// Pages kept for reading offline (the latest version you opened).
const READABLE = ["/", "/tasks", "/plan", "/money"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll([OFFLINE_URL, "/manifest.webmanifest", "/brand/lifeflow-mark-192.png", "/brand/lifeflow-mark-512.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Signing out clears every cached page, so no one else can read them on this device.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-user-data") event.waitUntil(caches.delete(PAGES));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Build assets never change once published: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/brand/")) {
    event.respondWith(
      caches.open(STATIC).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
    return;
  }

  // Full page loads: network first (fresh data), cached copy when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const path = url.pathname;
          if (res.ok && READABLE.includes(path) && !url.search && (res.headers.get("content-type") || "").includes("text/html")) {
            const c = await caches.open(PAGES);
            c.put(path, res.clone());
          }
          return res;
        } catch {
          const cached = (await caches.open(PAGES).then((c) => c.match(url.pathname))) || (await caches.match(OFFLINE_URL));
          return cached || new Response("You're offline.", { status: 503, headers: { "content-type": "text/plain" } });
        }
      })(),
    );
  }
  // Everything else (API, data for client navigation) goes to the network as usual.
});

// ---------------------------------------------------------------- push

self.addEventListener("push", (event) => {
  let msg = { title: "LifeFlow", body: "", url: "/", tag: undefined };
  try {
    msg = { ...msg, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(msg.title, {
      body: msg.body,
      tag: msg.tag,
      icon: "/brand/lifeflow-mark-192.png",
      badge: "/brand/lifeflow-mark-192.png",
      data: { url: msg.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(target);
          return w.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Android/Chrome: retry queued offline changes when the connection returns, even if the app is closed.
self.addEventListener("sync", (event) => {
  if (event.tag === "lf-offline-queue") {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((wins) => wins.forEach((w) => w.postMessage({ type: "flush-offline-queue" }))),
    );
  }
});
