// The opening screen: this moment's skyling rising out of the water, then the app behind it.
const { film } = require("./lib.cjs");
(async () => {
  const f = await film("splash", "2026-11-17T19:29:58Z");
  await f.page.clock.pauseAt(new Date("2026-11-17T19:30:00Z")); // held while the page loads, so the splash waits for the camera
  await f.page.goto("http://localhost:3100/?splash=1", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.page.waitForTimeout(1500);
  await f.tidy();
  for (let i = 0; i < 110; i++) { await f.frame("splash"); if (i % 10 === 0) await f.tidy(); }
  await f.done();
})();
