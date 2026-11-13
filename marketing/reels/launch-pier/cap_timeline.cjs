// Launch video: Today's day timeline only (the gold line, its stops and the skyling), see-through, flowing from the
// morning to now (10:40 PM). Everything else on the page is hidden; the frames are PNG with transparency.
const { film } = require("./lib.cjs"); const fs = require("fs"); const path = require("path");
const AT = process.env.AT || "2026-11-18T03:39:58Z"; const probe = process.argv[2] === "probe";
(async () => {
  const f = await film(process.env.NAME || "timeline", AT); const p = f.page;
  await p.clock.pauseAt(new Date(new Date(AT).getTime() + 2000));
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle", timeout: 240000 }).catch(() => {});
  await f.until(p.locator('[data-testid="day-clock"]'), 90000); await f.until(p.locator('[data-dc="hit"]'), 10000);
  await p.clock.runFor(1500); await p.evaluate(() => window.__step(1500)); await f.tidy();
  const dc = await p.locator('[data-testid="day-clock"]').boundingBox(); const hb = await p.locator('[data-dc="hit"]').boundingBox();
  await p.locator('[data-dc="hit"]').click({ noWaitAfter: true, position: { x: 216, y: dc.y + 200 - hb.y } });
  for (let i = 0; i < 45; i++) { await p.clock.runFor(1000 / 30); await p.evaluate(() => window.__step(1000 / 30)); }
  await f.tidy();
  const info = await p.evaluate(() => { const w = document.querySelector('[data-dc="trackWrap"]'); const r = w.getBoundingClientRect();
    return { open: document.querySelector('[data-testid="day-clock"]').dataset.open, rect: [r.x, r.y, r.width, r.height], sl: w.scrollLeft, sw: w.scrollWidth,
      nodes: [...w.querySelectorAll("[aria-label], .dc-node, .dc-now")].slice(0, 30).map((e) => [e.className.baseVal ?? e.className, e.getAttribute("aria-label"), Math.round(e.getBoundingClientRect().x + w.scrollLeft)]) }; });
  console.log(JSON.stringify(info));
  await p.screenshot({ path: f.out + "/open.png" });
  if (probe) return f.done();
  // see-through: only the timeline stays
  await p.addStyleTag({ content: `html, body, body * { background: transparent !important; background-color: transparent !important; box-shadow: none !important; }
    body * { visibility: hidden !important; } .dc-trackwrap, .dc-trackwrap * { visibility: visible !important; } .dc-skybg { opacity: 0 !important; } .dc-strip rect:not(.dc-strip-line *), .dc-strip circle:not(.dc-strip-line *), .dc-strip path:not(.dc-strip-line *) { display: none !important; }` });
  const r = info.rect; const FROM = Number(process.env.FROM || 1150), TO = Number(process.env.TO || 2150), STEP = Number(process.env.STEP || 2.5);
  const clip = { x: 0, y: Math.max(0, r[1] - 34), width: 432, height: r[3] + 68 };
  fs.writeFileSync(f.out + "/clip.json", JSON.stringify({ clip, home: info.sl, FROM, TO, STEP, sw: info.sw, nodes: info.nodes }));
  let i = 0;
  for (let v = FROM; v <= TO + 0.01; v += STEP) {
    await p.evaluate((x) => { const w = document.querySelector('[data-dc="trackWrap"]'); w.scrollLeft = x; w.dispatchEvent(new Event("scroll")); }, v);
    await p.clock.runFor(1000 / 30); await p.evaluate(() => window.__step(1000 / 30));
    i++; await p.screenshot({ path: path.join(f.out, `t${String(i).padStart(4, "0")}.png`), clip, omitBackground: true });
  }
  await f.done();
})();
