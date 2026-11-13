// the app's three cloud tiles (cloud-tile.ts) at 1:1 (48 x 21), day and night, plus their slices
const { chromium } = require("playwright"); const path = require("path"); const fs = require("fs"); const OUT = process.argv[2];
(async () => { const b = await chromium.launch(); const p = await b.newPage(); await p.goto("file://" + path.join(__dirname, "page.html"));
  const data = await p.evaluate(async () => { const out = []; for (let i = 0; i < 3; i++) { const st = window.LFC.cloudStyle(i);
    const get = (u) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement("canvas"); c.width = 48; c.height = 21; c.getContext("2d").drawImage(im, 0, 0); res(c.toDataURL()); }; im.src = u.slice(5, -2); });
    out.push({ slice: st["--cloud-slice"], day: await get(st["--cloud-day"]), night: await get(st["--cloud-night"]) }); } return out; });
  const meta = {};
  data.forEach((d, i) => { for (const k of ["day", "night"]) fs.writeFileSync(path.join(OUT, `tile-${i + 1}-${k}.png`), Buffer.from(d[k].split(",")[1], "base64"));
    const [T, R, B, L] = d.slice.split(" ").map(Number); meta[`tile-${i + 1}`] = { top: T, right: R, bottom: B, left: L }; });
  fs.writeFileSync(path.join(OUT, "tiles.json"), JSON.stringify(meta, null, 1)); console.log(meta); await b.close(); })();
