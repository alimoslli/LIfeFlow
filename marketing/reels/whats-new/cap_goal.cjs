// Goals: "Read 12 books" at 11 of 12 → +1 → the big sun ("Goal reached!"). Film clock 2:30 PM.
const { film } = require("./lib.cjs");
(async () => {
  const f = await film("goal", "2026-11-10T19:29:58Z"); const p = f.page;
  await p.clock.pauseAt(new Date("2026-11-10T19:30:00Z"));
  await p.goto("http://localhost:3100/goals", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.getByRole("button", { name: /One more for "Read 12 books"/ }), 60000); await f.tidy();
  for (let i = 0; i < 8; i++) { await p.clock.runFor(1000); await p.evaluate(() => window.__step && window.__step(1000)); } // off camera: anything that pops on arrival is over
  const plus = p.getByRole("button", { name: /One more for "Read 12 books"/ });
  await plus.scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 120)); await f.tidy();
  f.anchors.goal = await f.rect(plus.locator("xpath=ancestor::li[1]"));
  await f.hold("goals", 40);
  await f.tap("tapplus", plus);
  for (let i = 0; i < 120; i++) { await f.frame("sun"); if (i % 10 === 0) await f.tidy(); }
  await f.done();
})();
