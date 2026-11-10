const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path"); const http = require("http");
(async () => {
  const root = path.join(__dirname, "..");
  const types = { ".html": "text/html", ".jpg": "image/jpeg", ".woff2": "font/woff2" };
  const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(b); }); }).listen(0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2 });
  await p.goto(`http://127.0.0.1:${server.address().port}/whatsnew/storyboard.html`); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(__dirname, "out/Skyling_Scene_Storyboard.png"), fullPage: true });
  await b.close(); server.close();
})();
