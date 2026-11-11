// Settings › Ray: the five skylings and "Changes with the sky"; tap it.
const { film } = require("./lib.cjs");
(async () => {
  const f = await film("pick", "2026-11-17T19:29:58Z"); const p = f.page;
  await p.clock.pauseAt(new Date("2026-11-17T19:30:00Z"));
  await p.goto("http://localhost:3100/settings/jarvis", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  const grid = p.getByRole("radiogroup").first();
  await f.until(grid, 60000);
  await grid.evaluate((el) => { const sec = el.closest("section") || el; sec.scrollIntoView({ block: "start" }); }); await p.evaluate(() => window.scrollBy(0, -70));
  for (let i = 0; i < 6; i++) { await p.clock.runFor(250); await p.evaluate(() => window.__step(250)); } await f.tidy();
  const tile = p.getByRole("radio", { name: /Changes with the sky/ });
  f.anchors.grid = await f.rect(grid); f.anchors.sky = await f.rect(tile);
  await f.hold("idle", 75);
  await f.tap("tap", tile); for (let i = 0; i < 75; i++) await f.frame("picked");
  console.log("checked", await tile.getAttribute("aria-checked"), JSON.stringify(f.anchors));
  await f.done();
})();
