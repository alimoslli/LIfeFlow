// Today at 2:30 PM: the sky as it opens (Ray waves), then turned to see what's coming.
const { film } = require("./lib.cjs");
(async () => {
  const f = await film("sky", "2026-11-17T19:29:58Z"); const p = f.page;
  await p.clock.pauseAt(new Date("2026-11-17T19:30:00Z"));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 90000); await f.until(p.locator('[data-dc="hit"]'), 10000); await f.tidy();
  f.anchors.who = await f.rect(p.locator('[data-dc="who"]'));
  f.anchors.sun = await f.rect(p.getByText(/Sun sets in/).first());
  await f.hold("idle", 75); await f.tidy();
  const hb = await p.locator('[data-dc="hit"]').boundingBox(); const Y = hb.y + hb.height * 0.55; f.anchors.hit = [hb.x, hb.y, hb.width, hb.height];
  await f.drag("turn", 330, Y, 80, Y, 50, 24);
  await f.hold("turned", 40);
  await f.done();
})();
