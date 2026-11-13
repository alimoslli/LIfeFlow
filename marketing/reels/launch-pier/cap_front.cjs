// Launch video: Today (the front page) at one moment, held still. Usage: AT=<iso> node cap_front.cjs <name>
const { film } = require("./lib.cjs"); const fs = require("fs");
const AT = process.env.AT; const name = process.argv[2];
(async () => {
  const f = await film("front_" + name, AT); const p = f.page;
  await p.clock.pauseAt(new Date(new Date(AT).getTime() + 2000));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 90000);
  await p.clock.runFor(2500); await p.evaluate(() => window.__step && window.__step(2500)); await f.tidy();
  await f.hold("today", 90);
  await p.screenshot({ path: f.out + "/last.png" });
  fs.writeFileSync(f.out + "/text.txt", await p.evaluate(() => document.body.innerText));
  await f.done();
})();
