// 8:31 PM: Today's night sky with the stars earned today ("6 stars today"). The server runs on the same clock.
const { film } = require("./lib.cjs");
(async () => {
  const f = await film("night", "2026-11-11T01:30:58Z"); const p = f.page;
  await p.clock.pauseAt(new Date("2026-11-11T01:31:00Z"));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 60000); await f.until(p.locator('[data-dc="hit"]'), 10000);
  await p.clock.runFor(2000); await p.evaluate(() => window.__step(2000)); await f.tidy();
  f.anchors.stars = await f.rect(p.getByText(/stars today/).first());
  f.anchors.who = await f.rect(p.locator('[data-dc="who"]'));
  for (let i = 0; i < 120; i++) { await f.frame("night"); if (i % 10 === 0) await f.tidy(); }
  await f.done();
})();
