// Renders chat.html with chat_data.json frame by frame. Usage: node render_chat.cjs [preview t1,t2,..]
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const data = JSON.parse(fs.readFileSync(__dirname + "/chat_data.json", "utf8"));
  const prev = process.argv[2] ? process.argv[2].split(",").map(Number) : null;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(`window.DATA = ${JSON.stringify(data)};`);
  const p = await ctx.newPage();
  await p.goto("file://" + __dirname + "/chat.html");
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(400);
  const out = __dirname + (prev ? "/cprev" : "/cframes");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out);
  const times = prev || Array.from({ length: Math.round(data.total * 30) }, (_, i) => i / 30);
  for (const [i, t] of times.entries()) {
    await p.evaluate((t) => window.seek(t), t);
    await p.screenshot({ path: `${out}/${prev ? "p_" + t.toFixed(2) : String(i).padStart(5, "0")}.jpg`, type: "jpeg", quality: 93 });
  }
  await b.close();
  console.log("done", times.length);
})();
