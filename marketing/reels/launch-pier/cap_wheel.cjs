// Launch video: the wheel (Today's sky dome) turned from the morning through the night, on "Changes with the sky".
const { film } = require("./lib2.cjs"); const fs = require("fs"); const path = require("path");
const AT = process.env.AT || "2026-11-17T12:09:58Z";
(async () => {
  const f = await film("wheel2", AT); const p = f.page;
  await p.clock.pauseAt(new Date(new Date(AT).getTime() + 2000));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 90000); await f.until(p.locator('[data-dc="hit"]'), 10000);
  await p.clock.runFor(2500); await p.evaluate(() => window.__step(2500)); await f.tidy();
  const hb = await p.locator('[data-dc="hit"]').boundingBox(); const Y = hb.y + hb.height * 0.55;
  await p.addStyleTag({ content: `html, body, body * { background: transparent !important; background-color: transparent !important; box-shadow: none !important; }
    body * { visibility: hidden !important; } .dc-dome, .dc-dome *, .dc-who, .dc-words, .dc-words *, .dc-hit { visibility: visible !important; } .dc-skybg { opacity: 0 !important; }` });
  const clip = { x: 0, y: 0, width: 432, height: 300 };
  f.S.png = clip;
  await f.hold("now", 10);
  await f.drag("turn1", 420, Y, 60, Y, 110, 2); await f.hold("gap", 2);
  await f.drag("turn2", 420, Y, 230, Y, 60, 2); await f.hold("night", 20);
  await f.done();
})();
