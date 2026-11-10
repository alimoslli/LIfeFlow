// The skyling on Today (main 87acda3): type in the bar under the sky, send, the answer card under the bar, what it saved on
// the sky; then open the day to see the block on the line. Film clock 2:30 PM. REHEARSE=1 sends a /tool line to the fake model.
const { film } = require("./lib.cjs");
const Q = process.env.REHEARSE
  ? '/tool create_events {"events":[{"title":"Study: Chapter 6 reading response","date":"2026-11-10","startTime":"14:45","endTime":"15:45"}]}'
  : "Chapter 6 reading response is due tonight and I work 4 to 9. Find me time for it and put it on my day.";
(async () => {
  // the page's clock matches the server's (faketime "-<OFFSET_S>"): the proxy's certificates start an hour before real time
  const off = Number(process.env.OFFSET_S || 0) * 1000, t0 = process.env.OFFSET_S ? new Date(Date.now() - off + 20000) : new Date("2026-11-10T19:32:58Z");
  const f = await film(process.env.REHEARSE ? "ask_rehearse" : "ask", t0.toISOString()); const p = f.page;
  await p.clock.pauseAt(new Date(t0.getTime() + 2000)); console.log("film clock", new Date(t0.getTime() + 2000).toISOString());
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 90000); await f.until(p.locator('[data-dc="hit"]'), 10000);
  await p.clock.runFor(1500); await p.evaluate(() => window.__step(1500)); await f.tidy();
  const box = p.locator('input[aria-label^="Message"]:visible').first();
  f.anchors.bar = await f.rect(box.locator("xpath=ancestor::form[1]"));
  await f.hold("today", 24);
  await f.tap("tapbar", box); await box.focus().catch(() => {});
  const step = Math.ceil(Q.length / 34);
  for (let k = step; k < Q.length + step; k += step) { await box.fill(Q.slice(0, Math.min(k, Q.length)), { force: true }); await f.frame("type"); }
  await f.hold("typed", 12);
  await f.tap("tapsend", p.getByRole("button", { name: "Send", exact: true }).first());
  let last = "", same = 0, seen = false;
  for (let i = 0; i < 600; i++) {
    await f.frame("reply"); if (i % 8 === 0) await f.tidy();
    const t = await p.evaluate(() => { const c = document.querySelector('[data-testid="today-reply"]'); return c ? c.innerText : ""; });
    if (t.length > 30) seen = true;
    if (seen && t === last) same++; else same = 0; last = t;
    if (same > 30) break;
  }
  f.anchors.reply = await p.evaluate(() => { const c = document.querySelector('[data-testid="today-reply"]'); if (!c) return null; const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  console.log("REPLY:\n" + last);
  console.log("do it?", await p.getByRole("button", { name: "Do it", exact: true }).isVisible({ timeout: 200 }).catch(() => false));
  await f.hold("read", 45);
  const settle = async (tag) => { let last = "", same = 0; for (let i = 0; i < 600; i++) { await f.frame(tag); if (i % 8 === 0) await f.tidy(); const t = await p.evaluate(() => { const c = document.querySelector('[data-testid="today-reply"]'); return c ? c.innerText : ""; }); if (t === last && t.length > 30) same++; else same = 0; last = t; if (same > 30) break; } return last; };
  const doIt = p.getByRole("button", { name: "Do it", exact: true });
  if (process.env.DOIT && (await doIt.isVisible({ timeout: 200 }).catch(() => false))) {
    await f.tap("tapdoit", doIt); console.log("AFTER DO IT:\n" + (await settle("doit"))); await f.hold("read2", 45);
  }
  // open the day: the block on the line
  const dc = await p.locator('[data-testid="day-clock"]').boundingBox(); const hb = await p.locator('[data-dc="hit"]').boundingBox();
  f.S.finger = [216, hb.y + hb.height * 0.45]; await f.shot("tapsky");
  await p.locator('[data-dc="hit"]').click({ noWaitAfter: true, position: { x: 216, y: hb.height * 0.45 } }); f.S.finger = null;
  await f.hold("open", 70);
  f.anchors.block = await p.evaluate(() => { const b = [...document.querySelectorAll('[data-testid="day-clock"] button[aria-label]')].find((e) => /reading response/i.test(e.getAttribute("aria-label")) && !/ due/i.test(e.getAttribute("aria-label")) && e.getBoundingClientRect().x > -50); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  console.log("block", JSON.stringify(f.anchors.block));
  await f.done();
})();
