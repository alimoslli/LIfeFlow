// "A day, at its real time": 7:10 AM in New York, Dawn's moment (Changes with the sky). The opening screen, then Today.
const { film } = require("./lib.cjs");
const AT = process.env.AT || "2026-11-17T12:09:58Z";
(async () => {
  const f = await film("day_morning", AT); const p = f.page;
  await p.clock.pauseAt(new Date(new Date(AT).getTime() + 2000));
  await p.goto("http://localhost:3100/?splash=1", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await p.waitForTimeout(1500); await f.tidy();
  for (let i = 0; i < 120; i++) { await f.frame("splash"); if (i % 10 === 0) await f.tidy(); }
  await f.until(p.locator('[data-testid="day-clock"]'), 20000); await f.tidy();
  await f.hold("today", 90);
  await p.screenshot({ path: f.out + "/last.png" });
  await f.done();
})();
