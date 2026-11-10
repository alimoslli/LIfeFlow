// The tour: Today, then the dock's Money, School and More (Everything else). Real taps, film clock 2:30 PM.
const { film } = require("./lib.cjs");
(async () => {
  const f = await film("tour", "2026-11-10T19:29:58Z"); const p = f.page;
  await p.clock.pauseAt(new Date("2026-11-10T19:30:00Z"));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 60000); await f.until(p.locator('[data-dc="hit"]'), 10000); await f.tidy();
  await f.hold("today", 45); await f.tidy();
  const dock = (name) => p.locator("nav").last().getByRole("link", { name: new RegExp(`^${name}$`) }).or(p.locator("nav").last().getByRole("button", { name: new RegExp(`^${name}$`) })).first();
  f.anchors.dock = await f.rect(p.locator("nav").last());
  const go = async (name, tag, k) => {
    await f.tap("tap" + tag, dock(name));
    for (let i = 0; i < 40; i++) { await f.frame(tag); if (i % 5 === 0) await f.tidy(); }
    await p.waitForLoadState("networkidle").catch(() => {}); await f.tidy();
    await f.hold(tag, k);
  };
  await go("Money", "money", 70);
  f.anchors.money = { avail: await f.rect(p.getByText(/Available now/).first()) };
  await go("School", "school", 70);
  await go("More", "more", 80);
  await f.done();
})();
