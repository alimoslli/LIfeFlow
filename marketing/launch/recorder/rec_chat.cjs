// One continuous chat take with the real assistant, filmed smoothly: node rec_chat.cjs
// The page clock runs at 0.05x while we film, so every moment gets ~60 captured frames per second of app time.
// The real reply is fetched from the real server (real tools, real changes). While the server works, filming pauses
// (page clock frozen); then the reply that came back is handed to the app at a steady, readable pace in page time,
// so the stream, the status words and the auto-scroll all play smoothly instead of jumping between sparse frames.
const { chromium } = require('playwright');
const fs = require('fs');
const B = 'http://localhost:3000';
const SLOW = 0.05;
const OFF = Number(fs.readFileSync(__dirname + '/off.txt', 'utf8').trim()) * 1000;
const DIR = `${__dirname}/${process.env.OUT || 'frames_chat'}`;
const TURNS = JSON.parse(fs.readFileSync(__dirname + '/' + (process.env.TURNS || 'turns.json'), 'utf8')).slice(0, Number(process.env.N || 99));
const HOLD = (process.env.HOLD || '3.0,2.3,2.9,2.3,2.3').split(',').map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INIT = `(() => {
  const RD = Date, rnow = RD.now.bind(RD);
  let r0 = rnow(), v0 = rnow() + ${OFF}, rate = 1;
  const vnow = () => v0 + (rnow() - r0) * rate;
  window.__setRate = (r) => { v0 = vnow(); r0 = rnow(); rate = r; };
  class D extends RD { constructor(...a) { if (a.length === 0) super(vnow()); else super(...a); } static now() { return vnow(); } }
  D.parse = RD.parse; D.UTC = RD.UTC; window.Date = D;
  const css = document.createElement('style');
  css.textContent = '[data-sample-pill]{visibility:hidden!important} *{overflow-anchor:none!important}'; // iPhone Safari has no scroll anchoring: replies glide, never snap
  const hide = () => { if (!css.isConnected && document.head) document.head.appendChild(css);
    for (const el of document.querySelectorAll('span,div,button')) { if (el.childElementCount < 3 && /^\\s*Sample data\\s*$/.test(el.textContent || '')) { (el.parentElement && /Sample data/.test(el.parentElement.textContent) && el.parentElement.textContent.trim().length < 20 ? el.parentElement : el).style.visibility = 'hidden'; } } };
  new MutationObserver(hide).observe(document, { childList: true, subtree: true });

  // Smooth scrolling on the page clock (the browser's own smooth scroll runs on real time, which looks like a jump when slowed).
  const oScrollTo = Element.prototype.scrollTo;
  Element.prototype.scrollTo = function (a, b) {
    if (a && typeof a === 'object' && a.behavior === 'smooth') {
      const el = this, s = el.__sa || (el.__sa = {});
      s.from = el.scrollTop; s.to = Math.min(a.top == null ? el.scrollTop : a.top, el.scrollHeight - el.clientHeight); s.t0 = D.now(); // target fixed per call
      if (!s.run) { s.run = true; const step = () => { const k = Math.min(1, (D.now() - s.t0) / 420); const e = 1 - Math.pow(1 - k, 3);
        el.scrollTop = s.from + (s.to - s.from) * e;
        if (k < 1) requestAnimationFrame(step); else s.run = false; }; requestAnimationFrame(step); }
      return;
    }
    return oScrollTo.apply(this, arguments);
  };

  // The chat reply: fetched for real, then released to the app on the page clock.
  const ofetch = window.fetch.bind(window);
  const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__chat = null;
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\\/api\\/jarvis\\/actions\\//.test(url)) { const t0 = D.now(); const r = await ofetch(input, init); while (D.now() - t0 < 450) await realSleep(10); return r; }
    if (!/\\/api\\/jarvis\\/chat$/.test(url)) return ofetch(input, init);
    const res = await ofetch(input, init);
    if (!res.ok || !res.body) return res;
    const st = window.__chat = { done: false, lines: [], play: null, closed: false, released: 0 };
    (async () => { const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true });
        let nl; while ((nl = buf.indexOf('\\n')) >= 0) { const l = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (l) st.lines.push(JSON.parse(l)); } }
      if (buf.trim()) st.lines.push(JSON.parse(buf.trim()));
      st.done = true; })();
    const enc = new TextEncoder();
    const body = new ReadableStream({ async start(ctrl) {
      while (!st.play) await realSleep(15);
      const t0 = D.now();
      for (const ev of st.play) { while (D.now() - t0 < ev.at * 1000) await realSleep(10); ctrl.enqueue(enc.encode(ev.lines.map((x) => JSON.stringify(x)).join('\\n') + '\\n')); st.released++; }
      st.closed = true; ctrl.close();
    } });
    return new Response(body, { status: 200, headers: res.headers });
  };
  // Builds the release schedule (seconds of page time) from the real reply.
  window.__play = (o) => {
    const st = window.__chat, L = st.lines;
    const isTool = (e) => ['tool_start', 'tool_end', 'confirmation', 'memory_proposal'].includes(e.type);
    let last = -1; L.forEach((e, i) => { if (isTool(e)) last = i; });
    let finalStart = L.findIndex((e, i) => i > last && e.type === 'text');
    if (finalStart < 0) finalStart = L.length;
    const sched = []; let t = o.think, pend = [];
    for (let i = 0; i < finalStart; i++) { const e = L[i];
      if (e.type === 'conversation') { sched.push({ at: 0, lines: [e] }); continue; }
      pend.push(e); if (e.type === 'text') continue; // narration rides with the next tool event
      if (e.type === 'tool_end') { sched.push({ at: t, lines: pend }); pend = []; t += o.gap; continue; }
      sched.push({ at: t, lines: pend }); pend = []; t += e.type === 'tool_start' ? o.gap * 0.6 : o.gap; }
    const tail = []; let text = '';
    for (let i = finalStart; i < L.length; i++) { const e = L[i]; if (e.type === 'text') text += e.delta; else tail.push(e); }
    if (pend.length) sched.push({ at: t, lines: pend });
    const dur = Math.max(o.min, Math.min(o.max, text.length / o.cps));
    const ticks = Math.max(1, Math.round(dur * 40)); let prev = 0; t += 0.12;
    for (let k = 1; k <= ticks; k++) { const x = k / ticks; const want = Math.round(text.length * (x < 0.15 ? x * x / 0.3 : x - 0.075) / 0.925);
      let cut = k === ticks ? text.length : Math.max(prev, want); while (cut < text.length && cut > prev && !/\\s/.test(text[cut])) cut++;
      while (cut < text.length && (text.slice(0, cut).split('**').length - 1) % 2 === 1) { const j = text.indexOf('**', cut); cut = j < 0 ? text.length : j + 2; }
      if (cut > prev) { sched.push({ at: t + x * dur, lines: [{ type: 'text', delta: text.slice(prev, cut) }] }); prev = cut; } }
    if (prev < text.length) sched.push({ at: t + dur, lines: [{ type: 'text', delta: text.slice(prev) }] });
    sched.push({ at: t + dur + 0.15, lines: tail.length ? tail : [] });
    st.text = text; st.play = sched.filter((s) => s.lines.length);
    return { events: L.map((e) => e.type), textLen: text.length, dur, end: t + dur + 0.15 };
  };
  // Where things are on screen right now (for the edit's highlights and camera).
  window.__probe = () => {
    const sc = document.querySelector('[data-chat-scroll]'); if (!sc) return null;
    const rows = [...sc.querySelectorAll('.animate-fade-in.flex.gap-3')]; const a = rows[rows.length - 1];
    const R = (r) => [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10];
    const out = { st: Math.round(sc.scrollTop), sc: R(sc.getBoundingClientRect()) };
    if (a) { out.a = R(a.getBoundingClientRect()); out.s = [...a.querySelectorAll('strong, b')].map((e) => [e.textContent.trim(), [...e.getClientRects()].map(R)]); }
    return out;
  };
})();`;

(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ storageState: __dirname + '/state.json', viewport: { width: 390, height: 800 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, colorScheme: 'light', timezoneId: 'America/New_York', locale: 'en-US' });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Animation.enable');
  const log = { frames: [], probes: [], taps: [], marks: {}, turns: [] };
  let r0 = performance.now(), c0 = 0, rate = 1, rec = false, paused = false, busyShot = null;
  const now = () => (paused ? c0 : c0 + ((performance.now() - r0) / 1000) * rate);
  const setRate = async (r) => { c0 = now(); r0 = performance.now(); rate = r; await p.evaluate((x) => window.__setRate(x), r); await cdp.send('Animation.setPlaybackRate', { playbackRate: r }); };
  const wait = (c) => sleep((c / rate) * 1000);
  const mark = (k) => { log.marks[k] = now(); console.log('mark', k, now().toFixed(2), log.frames.length); };
  const pause = async () => { while (busyShot) await busyShot; c0 = now(); r0 = performance.now(); paused = true; await p.evaluate(() => window.__setRate(0)); await cdp.send('Animation.setPlaybackRate', { playbackRate: 0 }); };
  const resume = async (r = SLOW) => { r0 = performance.now(); paused = false; rate = r; await p.evaluate((x) => window.__setRate(x), r); await cdp.send('Animation.setPlaybackRate', { playbackRate: r }); };
  const start = async () => {
    await setRate(SLOW); c0 = 0; r0 = performance.now(); rec = true;
    (async () => {
      while (rec) {
        if (paused) { await sleep(20); continue; }
        const a = performance.now(); const C0 = c0, R0 = r0, RATE = rate;
        let done; busyShot = new Promise((r) => (done = r));
        const buf = await p.screenshot({ type: 'jpeg', quality: 90, scale: 'device' }).catch(() => null);
        const t = C0 + ((((a + performance.now()) / 2) - R0) / 1000) * RATE;
        const pr = await p.evaluate(() => window.__probe && window.__probe()).catch(() => null);
        done(); busyShot = null;
        if (buf) { const f = String(log.frames.length).padStart(5, '0') + '.jpg'; fs.writeFileSync(`${DIR}/${f}`, buf); log.frames.push([f, t, Math.round(a), Math.round(performance.now() - a)]); log.probes.push(pr); }
        const gap = ((1 / 60) / rate) * 1000 - (performance.now() - a);
        if (gap > 0) await sleep(gap);
      }
    })();
  };
  const tapAt = async (loc, after = 0.3) => {
    const bb = await loc.boundingBox();
    const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
    log.taps.push({ t: now(), x, y });
    await wait(0.1); await p.touchscreen.tap(x, y); await wait(after);
  };
  const type = async (text, per) => { for (const ch of text) { await p.keyboard.type(ch); await wait(per); } };

  await p.goto(B + '/jarvis?new=1'); await p.waitForLoadState('networkidle').catch(() => {}); await sleep(1500);
  await p.getByRole('button', { name: /New chat/i }).click({ timeout: 2000 }).catch(() => {});
  await sleep(800);
  await start(); mark('a'); await wait(0.3);
  for (const [i, spec] of TURNS.entries()) {
    const q = typeof spec === 'string' ? spec : spec.q;
    const box = p.locator('textarea').last();
    mark('tap' + i);
    await tapAt(box, 0.2);
    await type(q, Math.min(0.025, 0.85 / q.length)); await wait(0.22);
    const send = p.getByRole('button', { name: /^Send/ }).last();
    const tr = { q, tap: log.marks['tap' + i] };
    await tapAt(send, 0.0); tr.sent = now();
    await wait(0.14);
    await pause();
    let k = 0; while (!(await p.evaluate(() => window.__chat && window.__chat.done)) && k++ < 600) await sleep(500);
    console.log('resume at real', Math.round(performance.now())); await resume();
    const info = await p.evaluate(() => window.__play({ think: 0.42, gap: 0.27, cps: 380, min: 0.9, max: 2.1 }));
    tr.play = info; tr.streamFrom = now(); console.log('turn', i, JSON.stringify(info));
    while (!(await p.evaluate(() => window.__chat.closed))) await sleep(40);
    tr.replied = now(); console.log('closed at real', Math.round(performance.now()));
    await wait(0.7);
    tr.text = await p.evaluate(() => window.__chat.text);
    if (spec.confirm) { // read the preview, then approve it on the real Confirm card
      await setRate(0.5); await wait(1.1); await setRate(SLOW);
      const cb = p.getByRole('button', { name: 'Confirm', exact: true }).last();
      if (await cb.count()) { tr.confirmTap = now(); await tapAt(cb, 1.0); tr.confirmed = now(); } else console.log('NO CONFIRM CARD');
    }
    await setRate(0.5); await wait(HOLD[i] - 0.7); await setRate(SLOW);
    tr.end = now();
    log.turns.push(tr);
  }
  await wait(0.3); mark('end');
  rec = false; await sleep(600);
  fs.writeFileSync(`${__dirname}/${process.env.LOG || 'log_chat.json'}`, JSON.stringify(log));
  console.log('done', log.frames.length);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
