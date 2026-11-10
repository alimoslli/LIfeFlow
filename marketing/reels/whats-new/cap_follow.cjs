// After Ray's answer (no AI here): see | tick | night
//   see:   3:20 PM, open the day and slide to 9 PM: the block Ray added on the line
//   tick:  11:05 PM, the assignment's card on the line, Done, the star
//   night: 11:06 PM, Today's night sky with today's stars
const { film } = require("./lib.cjs");
const mode = process.argv[2];
const AT = { see: "2026-11-10T20:19:58Z", tick: "2026-11-11T04:04:58Z", night: "2026-11-11T04:05:58Z" }[mode];
(async () => {
  const f = await film("follow_" + mode, AT); const p = f.page;
  await p.clock.pauseAt(new Date(new Date(AT).getTime() + 2000));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 90000); await f.until(p.locator('[data-dc="hit"]'), 10000);
  await p.clock.runFor(1500); await p.evaluate(() => window.__step(1500)); await f.tidy();
  if (mode === "night") { f.anchors.stars = await f.rect(p.getByText(/stars? today/).first()); await f.hold("night", 110); return f.done(); }
  const dc = await p.locator('[data-testid="day-clock"]').boundingBox(); const hb = await p.locator('[data-dc="hit"]').boundingBox();
  const Y = dc.y + 200;
  f.S.finger = [216, Y]; await f.shot("tapsky");
  await p.locator('[data-dc="hit"]').click({ noWaitAfter: true, position: { x: 216, y: Y - hb.y } }); f.S.finger = null;
  await f.hold("open", 45); await f.tidy();
  const stopRect = (re) => p.evaluate((src) => { const r = new RegExp(src, "i"); const b = [...document.querySelectorAll('[data-testid="day-clock"] button[aria-label]')].find((e) => r.test(e.getAttribute("aria-label"))); if (!b) return null; const q = b.getBoundingClientRect(); return [q.x, q.y, q.width, q.height]; }, re);
  if (mode === "see") {
    const r = await stopRect("^PSY 101 Chapter 6 reading response(?! due)"); console.log("block before", JSON.stringify(r));
    if (r && r[0] > 330) await f.drag("slide", 380, Y, 380 - Math.min(300, r[0] - 260), Y, 36, 10);
    await f.hold("slid", 12);
    f.anchors.block = await stopRect("^PSY 101 Chapter 6 reading response(?! due)"); console.log("block", JSON.stringify(f.anchors.block));
    await f.hold("see", 70);
  } else {
    let r = await stopRect("^Chapter 6 reading response due"); console.log("due before", JSON.stringify(r));
    if (r && r[0] > 360) { await f.drag("slide", 380, Y, 380 - Math.min(300, r[0] - 280), Y, 30, 10); await f.hold("slid", 10); }
    const st = p.getByRole("button", { name: /^Chapter 6 reading response due/ }).first();
    await f.tap("tapstop", st, 36);
    f.anchors.card = await f.rect(p.locator(".dc-d-done"));
    await f.tap("tapdone", p.locator(".dc-d-done"));
    await f.hold("cheer", 80);
  }
  await f.done();
})();
