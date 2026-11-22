// Crisp app capture: screenshots at 2x in a loop while the same actions run (wheel, tap, drag along the day).
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const out = process.argv[2]; fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  const W = 390, H = 878; const b = await chromium.launch();
  const c0 = await b.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York', isMobile: true, hasTouch: true });
  const p0 = await c0.newPage(); await p0.goto('http://localhost:3000/login');
  await p0.fill('input[type=email], input[name=email]', 'demo@budgetflow.local'); await p0.fill('input[type=password]', 'budgetflow-demo');
  await Promise.all([p0.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 }), p0.click('button[type=submit]')]);
  const state = await c0.storageState(); await c0.close();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, timezoneId: 'America/New_York', isMobile: true, hasTouch: true, storageState: state });
  const p = await ctx.newPage(); await p.goto('http://localhost:3000/');
  await p.waitForSelector('[data-testid="day-clock"][data-ready="true"]', { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => { const els = [...document.querySelectorAll('body *')].filter(e => (e.innerText || '').trim().replace(/\s+/g, ' ') === 'Sample data'); if (els[0]) els[0].style.visibility = 'hidden'; });
  await p.waitForTimeout(1200);
  let run = true; const shots = []; const t0 = Date.now();
  const loop = (async () => { let k = 0; while (run) { const t = (Date.now() - t0) / 1000; await p.screenshot({ path: `${out}/f${String(k).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 92 }); shots.push(t); k++; } })();
  const cdp = await ctx.newCDPSession(p);
  const drag = async (x0, x1, y, ms) => { const n = Math.round(ms / 16); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= n; i++) { const e = i / n, k = e * e * (3 - 2 * e); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k, y }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await p.waitForTimeout(3000); const tTap = (Date.now() - t0) / 1000;
  await p.locator('[data-dc="today"]').first().click({ force: true }).catch(e => console.log('click err', e.message));
  await p.waitForTimeout(1700); await drag(300, 110, 230, 900); await p.waitForTimeout(700); await drag(110, 260, 230, 900); await p.waitForTimeout(1500);
  run = false; await loop; fs.writeFileSync(`${out}/times.json`, JSON.stringify({ shots, tap: tTap }));
  console.log('frames', shots.length, 'tap', tTap.toFixed(2), 'span', shots[shots.length - 1].toFixed(2)); await b.close();
})();
