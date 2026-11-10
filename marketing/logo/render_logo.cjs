const { chromium } = require("playwright");
const fs = require("fs"), path = require("path");
(async () => {
  const dir = __dirname, mode = process.argv[2] || "all";
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1080, height: 1080 } });
  p.on("console", (m) => console.log("console:", m.text()));
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto("file://" + path.join(dir, "logo.html"));
  await p.evaluate(() => window.ready);
  const grab = async (fn, arg) => Buffer.from((await p.evaluate(([fn, arg]) => { window[fn](arg); return document.getElementById("c").toDataURL("image/png"); }, [fn, arg])).split(",")[1], "base64");
  const cast = await p.evaluate(() => window.CAST.map((c) => c[0]));
  for (let i = 0; i < cast.length; i++) fs.writeFileSync(path.join(dir, "out", `LifeFlow_Logo_${i + 1}_${cast[i][0].toUpperCase() + cast[i].slice(1)}.png`), await grab("still", i));
  if (mode === "check") { for (const t of [0.3, 0.6, 1.0, 1.8, 2.05, 3.0, 7.0, 9.0, 11.0, 11.9]) fs.writeFileSync(path.join(dir, "chk_" + t.toFixed(2) + ".png"), await grab("seek", t)); }
  else { const loop = await p.evaluate(() => window.LOOP); const n = Math.round(loop * 30);
    for (let f = 0; f < n; f++) { fs.writeFileSync(path.join(dir, "frames", String(f + 1).padStart(4, "0") + ".png"), await grab("seek", f / 30)); } }
  await b.close();
})();
