const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await p.goto("file://" + __dirname + "/preview.html");
  for (const [id, n] of [
    ["s1", "entry"],
    ["s2", "day"],
    ["s3", "scrub"],
    ["s4", "examples"],
  ])
    await p.locator("#" + id).screenshot({ path: __dirname + "/" + n + ".png" });
  await b.close();
})();
