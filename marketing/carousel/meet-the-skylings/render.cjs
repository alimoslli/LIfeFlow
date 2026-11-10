const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path"); const http = require("http");
(async () => {
  const root = path.join(__dirname, ".."), out = path.join(__dirname, "out");
  const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2" };
  const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(b); }); }).listen(0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1350 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/carousel/carousel.html`); await p.evaluate(() => window.ready);
  const names = ["Cover", "Dawn", "Ray", "Noon", "Goldie", "Dusk", "Star", "Which_one_is_yours"];
  for (let i = 0; i < 8; i++) { const d = await p.evaluate(async (i) => { await window.slide(i); return document.getElementById("c").toDataURL("image/png"); }, i);
    fs.writeFileSync(path.join(out, `LifeFlow_Meet_The_Skylings_${i + 1}_${names[i]}.png`), Buffer.from(d.split(",")[1], "base64")); }
  await b.close(); server.close();
})();
