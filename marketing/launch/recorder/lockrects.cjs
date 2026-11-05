const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })).newPage();
  const N = JSON.parse(fs.readFileSync(__dirname + "/lock/notes.json", "utf8"));
  await p.goto("file://" + __dirname + "/lock/lock.html#" + encodeURIComponent(JSON.stringify(N)));
  await p.waitForTimeout(800);
  await p.evaluate(() => {
    for (const i of [0, 1, 2]) window.showN(i);
  });
  await p.waitForTimeout(1500);
  const r = {};
  for (const i of [0, 1, 2]) {
    const bb = await p.locator("#n" + i).boundingBox();
    r["n" + i] = [bb.x, bb.y, bb.width, bb.height];
  }
  fs.writeFileSync(__dirname + "/lock/rects.json", JSON.stringify(r));
  await p.screenshot({ path: __dirname + "/lock/full.png" });
  console.log(JSON.stringify(r));
  await b.close();
})();
