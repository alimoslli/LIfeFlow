// Renders story.html frame by frame. Usage: node render.cjs <outDir> [times...]  (no times: the whole film at 30 fps)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const http = require("http");
(async () => {
  const out = process.argv[2];
  const times = process.argv.slice(3).map(Number);
  fs.mkdirSync(out, { recursive: true });
  const types = { ".html": "text/html", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2", ".js": "text/javascript" };
  const server = http.createServer((req, res) => {
    const f = path.join(__dirname, decodeURIComponent(req.url.split("?")[0]));
    fs.readFile(f, (err, buf) => { if (err) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(buf); });
  }).listen(0);
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.goto(`http://127.0.0.1:${port}/story.html`);
  await page.evaluate(() => window.ready);
  const list = times.length ? times : Array.from({ length: Math.round(23.4 * 30) }, (_, i) => i / 30);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const data = await page.evaluate(async (t) => {
      await window.seek(t);
      return document.getElementById("c").toDataURL(t < 0 ? "image/png" : "image/jpeg", 0.95);
    }, t);
    const name = t < 0 ? `poster_${-t}.png` : times.length ? `t_${t.toFixed(2)}.jpg` : `${String(i + 1).padStart(4, "0")}.jpg`;
    fs.writeFileSync(path.join(out, name), Buffer.from(data.split(",")[1], "base64"));
    if (!times.length && i % 60 === 0) console.log("frame", i);
  }
  await browser.close();
  server.close();
})();
