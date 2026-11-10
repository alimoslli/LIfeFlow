// node render.cjs <outDir> [times...]  (no times: the whole reel at 30 fps)
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path"); const http = require("http");
(async () => {
  const out = process.argv[2], times = process.argv.slice(3).map(Number); fs.mkdirSync(out, { recursive: true });
  const root = path.join(__dirname, "..");
  const types = { ".html": "text/html", ".js": "text/javascript", ".jpg": "image/jpeg", ".png": "image/png", ".woff2": "font/woff2" };
  const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(b); }); }).listen(0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/appfilm/film_full.html`); await p.evaluate(() => window.ready);
  const fin = await p.evaluate(() => window.S.end);
  const list = times.length ? times : Array.from({ length: Math.round(fin * 30) }, (_, i) => i / 30);
  for (let i = 0; i < list.length; i++) {
    const d = await p.evaluate(async (t) => { await window.seek(t); return document.getElementById("c").toDataURL("image/jpeg", 0.95); }, list[i]);
    fs.writeFileSync(path.join(out, times.length ? `t_${list[i].toFixed(2)}.jpg` : `${String(i + 1).padStart(4, "0")}.jpg`), Buffer.from(d.split(",")[1], "base64"));
  }
  await b.close(); server.close();
})();
