// Real app, at the film phone's screen shape: Today with the day wheel, tap the wheel, the day opens, drag along it.
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2]; const W = 390, H = 878;
  const b = await chromium.launch();
  const c0 = await b.newContext({ viewport: { width: W, height: H }, timezoneId: 'America/New_York', isMobile: true, hasTouch: true });
  const p0 = await c0.newPage();
  await p0.goto('http://localhost:3000/login');
  await p0.fill('input[type=email], input[name=email]', 'demo@budgetflow.local');
  await p0.fill('input[type=password]', 'budgetflow-demo');
  await Promise.all([p0.waitForURL(u => !u.pathname.startsWith('/login'), { timeout: 30000 }), p0.click('button[type=submit]')]);
  const state = await c0.storageState(); await c0.close();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, timezoneId: 'America/New_York', isMobile: true, hasTouch: true, storageState: state, recordVideo: { dir: out + '/vid3', size: { width: W, height: H } } });
  const p = await ctx.newPage(); const t0 = Date.now(); const T = () => ((Date.now() - t0) / 1000).toFixed(2);
  await p.goto('http://localhost:3000/');
  await p.waitForSelector('[data-testid="day-clock"][data-ready="true"]', { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => { const els = [...document.querySelectorAll('body *')].filter(e => (e.innerText || '').trim().replace(/\s+/g, ' ') === 'Sample data'); if (els[0]) els[0].style.visibility = 'hidden'; });
  await p.waitForTimeout(3000); console.log('click', T());
  await p.locator('[data-dc="today"]').first().click({ force: true }).catch(e => console.log('click err', e.message));
  await p.waitForTimeout(1700); console.log('drag1', T());
  const cdp = await ctx.newCDPSession(p);
  const drag = async (x0, x1, y, ms) => { const n = Math.round(ms / 16);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= n; i++) { const e = i / n, k = e * e * (3 - 2 * e); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (x1 - x0) * k, y }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await drag(300, 110, 230, 700); await p.waitForTimeout(500); console.log('drag2', T()); await p.screenshot({ path: out + '/drag1.png' });
  await drag(110, 300, 230, 700); await p.waitForTimeout(900); console.log('end', T()); await p.screenshot({ path: out + '/drag2.png' });
  await ctx.close(); await b.close(); console.log('done');
})();
