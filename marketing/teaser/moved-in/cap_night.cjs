// Captures the landing's night scene frame by frame on a fake clock. node cap_night.cjs <out> <seconds> [cheerAt]
const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path"); const http = require("http");
(async () => {
  const [out, secs, cheerAt] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4] || -1)];
  fs.mkdirSync(out, { recursive: true });
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png" };
  const server = http.createServer((req, res) => { const f = path.join(__dirname, decodeURIComponent(req.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(b); }); }).listen(0);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await page.clock.install({ time: new Date("2026-11-10T03:00:00Z") });
  await page.goto(`http://127.0.0.1:${server.address().port}/night.html`);
  await page.clock.runFor(100);
  const n = Math.round(secs * 30);
  for (let i = 0; i < n; i++) {
    if ([1.6, 11.2].some((c) => Math.abs(i / 30 - c) < 1 / 60)) await page.evaluate(() => window.scene.cheer());
    await page.clock.runFor(1000 / 30);
    const buf = await page.locator("#host").screenshot({ type: "jpeg", quality: 92 });
    fs.writeFileSync(path.join(out, String(i + 1).padStart(4, "0") + ".jpg"), buf);
  }
  await browser.close(); server.close();
})();
