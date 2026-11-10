const { chromium } = require("playwright"); const fs = require("fs"); const path = require("path"); const http = require("http");
(async () => {
  const root = path.join(__dirname, "..");
  const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".woff2": "font/woff2" };
  const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split("?")[0])); fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end(); } res.writeHead(200, { "Content-Type": types[path.extname(f)] || "application/octet-stream" }); res.end(b); }); }).listen(0);
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on("pageerror", (e) => console.log("ERR", e.message));
  await p.goto(`http://127.0.0.1:${server.address().port}/sting/sting.html`); await p.evaluate(() => window.ready);
  for (const mode of ["intro", "outro"]) {
    const dir = path.join(__dirname, "f_" + mode); fs.mkdirSync(dir, { recursive: true });
    const L = await p.evaluate((m) => window.LEN[m], mode);
    for (let i = 0; i < Math.round(L * 30); i++) { const d = await p.evaluate(async ([t, m]) => { await window.seek(t, m); return document.getElementById("c").toDataURL("image/jpeg", 0.95); }, [i / 30, mode]);
      fs.writeFileSync(path.join(dir, String(i + 1).padStart(4, "0") + ".jpg"), Buffer.from(d.split(",")[1], "base64")); }
  }
  await b.close(); server.close();
})();
