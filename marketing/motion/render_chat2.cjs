// Renders chat2.html with chat2_data.json frame by frame at 60 fps. Usage: node render_chat2.cjs [preview t1,t2,..]
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const data = JSON.parse(fs.readFileSync(__dirname + '/chat2_data.json', 'utf8'));
  const prev = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
  const FPS = 60;
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(`window.DATA = ${JSON.stringify(data)};`);
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await p.goto('file://' + __dirname + '/chat2.html'); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(500);
  const out = __dirname + (prev ? '/cprev2' : '/cframes2');
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
  const times = prev || Array.from({ length: Math.round(data.total * FPS) }, (_, i) => i / FPS);
  for (const [i, t] of times.entries()) {
    await p.evaluate((t) => window.seek(t), t);
    await p.screenshot({ path: `${out}/${prev ? 'p_' + t.toFixed(2) : String(i).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 92 });
    if (!prev && i % 300 === 0) console.log('frame', i, '/', times.length);
  }
  await b.close(); console.log('done', times.length);
})();
