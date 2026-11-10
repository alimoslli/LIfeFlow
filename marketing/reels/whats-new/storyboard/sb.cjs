// Storyboard stills for the planned skyling scene (no AI is called): ask | block | tick
const { film } = require("./lib.cjs");
const mode = process.argv[2];
(async () => {
  const at = mode === "tick" ? "2026-11-10T20:49:58Z" : "2026-11-10T19:29:58Z";
  const f = await film("sb_" + mode, at); const p = f.page;
  await p.clock.pauseAt(new Date(new Date(at).getTime() + 2000));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 90000); await f.until(p.locator('[data-dc="hit"]'), 10000);
  await p.clock.runFor(1500); await p.evaluate(() => window.__step(1500)); await f.tidy();
  if (mode === "ask") {
    const box = p.locator('input[aria-label^="Message"]:visible').first(); console.log('inputs', await p.locator('input[aria-label^="Message"]').count());
    await box.fill("Chapter 6 reading response is due tonight and I work 4 to 9. When do I do it?", { force: true }); await box.press("End", { force: true }).catch(() => {}); await p.evaluate(() => window.scrollTo(0, 0)); console.log("value", await box.inputValue());
    await f.hold("ask", 10);
  } else {
    const dc = await p.locator('[data-testid="day-clock"]').boundingBox(); const hb = await p.locator('[data-dc="hit"]').boundingBox();
    await p.locator('[data-dc="hit"]').click({ position: { x: 216, y: dc.y + 200 - hb.y } });
    for (let i = 0; i < 45; i++) await f.frame("open"); await f.tidy();
    if (mode === "tick") {
      const Y = dc.y + 200; await f.drag("slide", 380, Y, 120, Y, 30, 10); await f.hold("slid", 12);
      const st = p.getByRole("button", { name: /^Chapter 6 reading response/ }).first();
      await f.tap("tapstop", st, 30);
      await f.tap("tapdone", p.locator(".dc-d-done"));
      await f.hold("cheer", 30);
    } else await f.hold("block", 10);
  }
  await f.done();
})();
