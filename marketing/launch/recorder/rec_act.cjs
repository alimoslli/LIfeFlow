// Films the real app (demo account, everything connected) in action, one scene per run: node rec_act.cjs <scene>
// Slow page clock + CSS while tapping/typing (smooth frames); real speed while the assistant replies.
const { chromium } = require("playwright");
const fs = require("fs");
const B = "http://localhost:3000";
const SLOW = 0.05;
const OFF = Number(fs.readFileSync(__dirname + "/off.txt", "utf8").trim()) * 1000;
const SCENE = process.argv[2];
const DIR = `${__dirname}/frames_${SCENE}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const INIT = `(() => {
  const RD = Date, rnow = RD.now.bind(RD);
  let r0 = rnow(), v0 = rnow() + ${OFF}, rate = 1;
  const vnow = () => v0 + (rnow() - r0) * rate;
  window.__setRate = (r) => { v0 = vnow(); r0 = rnow(); rate = r; };
  class D extends RD { constructor(...a) { if (a.length === 0) super(vnow()); else super(...a); } static now() { return vnow(); } }
  D.parse = RD.parse; D.UTC = RD.UTC; window.Date = D;
  const css = document.createElement('style');
  css.textContent = '[data-sample-pill]{visibility:hidden!important}';
  const hide = () => { if (!css.isConnected && document.head) document.head.appendChild(css);
    for (const el of document.querySelectorAll('span,div,button')) { if (el.childElementCount < 3 && /^\\s*Sample data\\s*$/.test(el.textContent || '')) { const p = el.closest('div,span') ; (el.parentElement && /Sample data/.test(el.parentElement.textContent) && el.parentElement.textContent.trim().length < 20 ? el.parentElement : el).style.visibility = 'hidden'; } } };
  new MutationObserver(hide).observe(document, { childList: true, subtree: true });
})();`;

(async () => {
  fs.rmSync(DIR, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({
    storageState: __dirname + "/state.json",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    timezoneId: "America/New_York",
    locale: "en-US",
  });
  await ctx.addInitScript(INIT);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Animation.enable");
  const log = { frames: [], taps: [], marks: {}, rects: {} };
  // content clock: piecewise, follows the page's clock rate
  let r0 = performance.now(),
    c0 = 0,
    rate = 1,
    rec = false;
  const now = () => c0 + ((performance.now() - r0) / 1000) * rate;
  const setRate = async (r) => {
    c0 = now();
    r0 = performance.now();
    rate = r;
    await p.evaluate((x) => window.__setRate && window.__setRate(x), r);
    await cdp.send("Animation.setPlaybackRate", { playbackRate: r });
  };
  const wait = (c) => sleep((c / rate) * 1000);
  const mark = (k) => {
    log.marks[k] = now();
    console.log("mark", k, now().toFixed(2), log.frames.length);
  };
  const go = async (path) => {
    await p.goto(B + path);
    await p.waitForLoadState("networkidle").catch(() => {});
    await sleep(1800);
  };
  const start = async () => {
    await setRate(SLOW);
    c0 = 0;
    r0 = performance.now();
    rec = true;
    (async () => {
      while (rec) {
        const a = performance.now();
        const buf = await p.screenshot({ type: "jpeg", quality: 90, scale: "device" }).catch(() => null);
        const t = c0 + (((a + performance.now()) / 2 - r0) / 1000) * rate;
        if (buf) {
          const f = String(log.frames.length).padStart(5, "0") + ".jpg";
          fs.writeFileSync(`${DIR}/${f}`, buf);
          log.frames.push([f, t]);
        }
        const gap = (1 / 60 / rate) * 1000 - (performance.now() - a);
        if (gap > 0) await sleep(gap);
      }
    })();
  };
  const tapAt = async (loc, after = 0.6) => {
    await loc.scrollIntoViewIfNeeded().catch(() => {});
    const bb = await loc.boundingBox();
    const x = bb.x + bb.width / 2,
      y = bb.y + bb.height / 2;
    log.taps.push({ t: now(), x, y });
    await wait(0.12);
    await p.touchscreen.tap(x, y);
    await wait(after);
  };
  const type = async (text, per = 0.045) => {
    for (const ch of text) {
      await p.keyboard.type(ch);
      await wait(per);
    }
  };
  const scrollBy = async (dy, secs) => {
    const y0 = await p.evaluate(() => window.scrollY);
    const steps = Math.max(1, Math.round(secs * 30));
    for (let i = 1; i <= steps; i++) {
      const k = i / steps;
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      await p.evaluate((y) => window.scrollTo(0, y), y0 + dy * e);
      await wait(secs / steps);
    }
  };
  const nav = (name) => p.getByRole("navigation").last().getByRole("link", { name, exact: true }).first();
  const rect = async (loc, key) => {
    log.rects[key] = {
      t: now(),
      r: await loc.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    };
  };
  const waitReply = async () => {
    await setRate(1);
    let last = "",
      same = 0;
    for (let k = 0; k < 240 && same < 4; k++) {
      await sleep(500);
      const t = await p.locator("main").innerText();
      same = t === last && !/Thinking…|Working|Checking|Looking|Reading/.test(t) ? same + 1 : 0;
      last = t;
    }
    await setRate(SLOW);
  };
  const ask = async (text) => {
    const box = p.locator("textarea").last();
    await tapAt(box, 0.25);
    await type(text);
    await wait(0.35);
    const send = p.getByRole("button", { name: /^Send/ }).last();
    if (await send.count()) await tapAt(send, 0.1);
    else await p.keyboard.press("Enter");
    mark("sent");
    await waitReply();
    mark("replied");
  };
  const replyRect = async (q, key) => {
    const r = await p
      .evaluate((q) => {
        const els = [...document.querySelectorAll("main *")].filter((e) => e.childElementCount === 0 && e.textContent.trim() === q);
        let row = els[els.length - 1];
        if (!row) return null;
        while (row.parentElement && !row.nextElementSibling) row = row.parentElement;
        const a = row.nextElementSibling;
        if (!a) return null;
        const b = a.getBoundingClientRect();
        return [b.x, b.y, b.width, b.height];
      }, q)
      .catch(() => null);
    if (r) log.rects[key] = { t: now(), r };
  };
  const lastReply = () => p.locator("main").getByText(/./).last();

  if (SCENE === "today") {
    await go("/");
    await start();
    mark("a");
    await wait(1.6);
    await scrollBy(300, 1.6);
    await wait(0.8);
    mark("b");
    await scrollBy(420, 1.6);
    await wait(1.0);
  } else if (SCENE === "tour") {
    await go("/");
    await start();
    mark("a");
    await wait(0.5);
    await tapAt(nav("Plan"), 1.4);
    mark("plan");
    await scrollBy(380, 1.0);
    await wait(0.5);
    await tapAt(p.getByRole("link", { name: "Work", exact: true }).first(), 1.4);
    mark("work");
    await tapAt(nav("School"), 1.4);
    mark("school");
    await tapAt(nav("Money"), 1.6);
    mark("money");
    await scrollBy(420, 1.2);
    await wait(0.8);
  } else if (SCENE === "lab" || SCENE === "swap" || SCENE === "quiz") {
    await go("/jarvis?new=1");
    await p
      .getByRole("button", { name: /New chat/i })
      .click({ timeout: 2000 })
      .catch(() => {});
    await sleep(1000);
    await start();
    mark("a");
    await wait(0.5);
    const Q = {
      lab: "My lab report is a day late and I work 4 to 9 tonight. Block time today so I can finish it.",
      swap: "My library shift overlaps my calc class today. Write my manager a quick message asking to swap.",
      quiz: "Quiz me for my Research methods quiz on Sunday. One question at a time.",
    };
    await ask(Q[SCENE]);
    await replyRect(Q[SCENE], "reply1");
    await wait(1.4);
    log.replyText1 = (await p.locator("main").innerText()).slice(-1500);
    if (SCENE === "quiz") {
      const txt = log.replyText1;
      const ans = /independent/i.test(txt)
        ? "Independent is what you change. Dependent is what you measure."
        : /hypothesis/i.test(txt)
          ? "A testable prediction about what will happen."
          : /correlation/i.test(txt)
            ? "Correlation doesn't mean one causes the other."
            : /sample|population/i.test(txt)
              ? "The sample is the smaller group you actually study."
              : "Random assignment, so the groups start out the same.";
      await ask(ans);
      await replyRect(ans, "reply2");
      await wait(1.6);
      log.replyText2 = (await p.locator("main").innerText()).slice(-1500);
    }
    if (SCENE === "lab") {
      await tapAt(nav("Plan"), 1.8);
      mark("plan");
      await wait(1.0);
    }
  } else if (SCENE === "lock") {
    const N = JSON.parse(fs.readFileSync(__dirname + "/lock/notes.json", "utf8"));
    await p.goto("file://" + __dirname + "/lock/lock.html#" + encodeURIComponent(JSON.stringify(N)));
    await sleep(1500);
    await start();
    mark("a");
    await wait(0.7);
    await p.evaluate(() => window.showN(0));
    mark("n0");
    await wait(2.0);
    await p.evaluate(() => window.showN(1));
    mark("n1");
    await wait(1.5);
    await p.evaluate(() => window.showN(2));
    mark("n2");
    await wait(1.8);
    const bb = await p.locator("#n0").boundingBox();
    log.taps.push({ t: now(), x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
    await wait(0.12);
    await p.evaluate(() => window.pressN(0));
    mark("tap");
    await wait(0.45);
  } else if (SCENE === "open") {
    await go("/");
    await start();
    mark("a");
    await wait(1.4);
    await tapAt(p.getByRole("link", { name: /new update/ }).first(), 1.4);
    mark("feed");
    const title = p.getByText("Midterm exam vs. your shift").first();
    const top = await title.evaluate((e) => e.getBoundingClientRect().top);
    if (top > 200) {
      await scrollBy(top - 170, 1.1);
      await wait(0.5);
    }
    mark("card");
    await tapAt(p.getByRole("button", { name: "Block it", exact: true }).first(), 1.6);
    mark("done");
    log.rects.feedcard = {
      t: now(),
      r: await p.evaluate(() => {
        const t = [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && e.textContent.trim() === "Midterm exam vs. your shift");
        let e = t;
        while (e && e.parentElement && !/Undo|Blocked/.test(e.textContent)) e = e.parentElement;
        while (e && e.parentElement && e.getBoundingClientRect().width < 340) e = e.parentElement;
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    };
    log.feedText = (await p.locator("main").innerText()).slice(0, 2500);
    await wait(0.6);
    await tapAt(nav("Plan"), 1.6);
    mark("plan");
    const blk = p.getByText(/Work on Midterm exam/).first();
    if (await blk.count()) {
      const y = await blk.evaluate((e) => e.getBoundingClientRect().top);
      if (y > 560) {
        await scrollBy(y - 420, 1.2);
        await wait(0.4);
      }
    }
    mark("planblock");
    await wait(1.4);
  } else if (SCENE === "convo") {
    const turns = JSON.parse(fs.readFileSync(__dirname + "/turns.json", "utf8"));
    await go("/jarvis?new=1");
    await p
      .getByRole("button", { name: /New chat/i })
      .click({ timeout: 2000 })
      .catch(() => {});
    await sleep(1000);
    await start();
    mark("a");
    await wait(0.4);
    log.turns = [];
    for (const [i, q] of turns.entries()) {
      await ask(q);
      mark("r" + i);
      await replyRect(q, "reply" + i);
      const full = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY);
      log.turns.push({ q, sent: log.marks.sent, replied: log.marks.replied });
      await wait(1.0);
      if (i === 0) {
        // the morning brief is long: scroll back to its top, then read down through it
        const top = (log.rects["reply0"] || { r: [0, 0] }).r[1];
        if (top < 60) {
          await scrollBy(top - 120, 0.8);
          await wait(0.6);
          await scrollBy(-(top - 120), 2.6);
          await wait(0.5);
        }
      }
      log.turns[i].text = (await p.locator("main").innerText()).slice(-1800);
    }
    await wait(1.0);
  } else if (SCENE === "feed") {
    await go("/jarvis/says");
    await start();
    mark("a");
    await wait(0.8);
    const title = p.getByText("Research methods quiz vs. your shift").first();
    const top = await title.evaluate((e) => e.getBoundingClientRect().top);
    await scrollBy(top - 170, 1.4);
    await wait(0.6);
    mark("card");
    const idx = await p.evaluate(() => {
      const bs = [...document.querySelectorAll("button")].filter((x) => x.textContent.trim() === "Block it");
      return bs.findIndex((x) => {
        let e = x;
        for (let i = 0; i < 10 && e; i++) {
          e = e.parentElement;
          if (e && /Research methods quiz vs\. your shift/.test(e.textContent)) return !/Group project/.test(e.textContent);
        }
        return false;
      });
    });
    await tapAt(p.getByRole("button", { name: "Block it", exact: true }).nth(Math.max(0, idx)), 1.6);
    mark("done");
    log.rects.feedcard = {
      t: now(),
      r: await p.evaluate(() => {
        const t = [...document.querySelectorAll("*")].find((e) => e.childElementCount === 0 && e.textContent.trim() === "Research methods quiz vs. your shift");
        let e = t;
        while (e && e.parentElement && !/Snooze|Undo|Done|Blocked/.test(e.textContent)) e = e.parentElement;
        while (e && e.parentElement && e.getBoundingClientRect().width < 340) e = e.parentElement;
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      }),
    };
    log.feedText = (await p.locator("main").innerText()).slice(0, 1500);
    await wait(1.0);
  }
  mark("end");
  rec = false;
  await sleep(400);
  fs.writeFileSync(`${__dirname}/log_${SCENE}.json`, JSON.stringify(log));
  console.log("done", SCENE, log.frames.length);
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
