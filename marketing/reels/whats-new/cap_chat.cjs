// An idea cloud on Today: "Tell Ray I'll study tonight at 8" → tap → the bar fills → send → the chat, Ray's real reply
// (the promise saved with make_promise). Film clock 2:30 PM; the server runs on the same clock (serve.sh).
const { film } = require("./lib.cjs");
(async () => {
  const f = await film("chat", "2026-11-10T19:29:58Z"); const p = f.page;
  await p.clock.pauseAt(new Date("2026-11-10T19:30:00Z"));
  // once, off camera: the chat's "Before we start" consent, as the person would answer it
  await p.goto("http://localhost:3100/jarvis", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  const allow = p.getByRole("button", { name: /^Allow$/ }); await f.until(allow, 8000);
  if (await allow.isVisible().catch(() => false)) { await allow.click(); await p.clock.runFor(1500); await p.waitForLoadState("networkidle").catch(() => {}); console.log("allowed"); }
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 60000); await f.until(p.locator('[data-dc="hit"]'), 10000); await f.tidy();
  const cloud = p.locator(".lf-idea-cloud:visible").filter({ hasText: /study tonight/ }).first();
  for (let i = 0; i < 60 && !(await cloud.isVisible().catch(() => false)); i++) await p.clock.runFor(1000); // off camera: wait for that cloud
  await p.clock.runFor(1200); await f.tidy();
  f.anchors.cloud = await f.rect(cloud); f.anchors.bar = await f.rect(p.locator("form").filter({ has: p.locator('input[aria-label^="Message"]') }).last());
  await f.hold("today", 30);
  await f.tap("tapcloud", cloud, 30);
  await f.tap("tapsend", p.getByRole("button", { name: "Send" }).last());
  let seenStop = false, quiet = 0;
  for (let i = 0; i < 420; i++) {
    await f.frame("reply"); if (i % 6 === 0) await f.tidy();
    const busy = await p.getByRole("button", { name: "Stop" }).isVisible().catch(() => false);
    if (busy) seenStop = true; else if (seenStop || i > 120) quiet++;
    if (quiet > 20) break;
  }
  f.anchors.last = await f.rect(p.locator("main").last());
  await f.hold("read", 60);
  await f.done();
})();
