// 8:31 PM: Today brings the promise check-in ("Did you study tonight?"), tap "Yes, I did it". The server must run on
// the same clock (serve.sh "2026-11-11 01:30:30").
const { film } = require("./lib.cjs");
(async () => {
  const f = await film("promise", "2026-11-11T01:30:58Z"); const p = f.page;
  await p.clock.pauseAt(new Date("2026-11-11T01:31:00Z"));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 60000); await f.until(p.locator('[data-dc="hit"]'), 10000); await p.clock.runFor(1500); await f.tidy();
  const yes = p.getByRole("button", { name: /Yes, I did it/ }).first();
  await yes.waitFor({ timeout: 30000 });
  f.anchors.card = await f.rect(yes.locator("xpath=ancestor::*[contains(@class,'rounded')][1]"));
  await f.hold("card", 60);
  await f.tap("tapyes", yes);
  for (let i = 0; i < 100; i++) { await f.frame("kept"); if (i % 10 === 0) await f.tidy(); }
  await f.done();
})();
