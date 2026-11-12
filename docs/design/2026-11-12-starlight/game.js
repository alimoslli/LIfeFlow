/* Starlight (prototype, 2026-11-12): one move, built deep. Tap a star and Twinkle zips there and lights it. The sea rises,
   slowly, then faster. Light a whole shape to push the sea back. Higher up, some stars twinkle: catch them while they glow.
   Twinkle, the stars and the clouds are drawn by the app's own code (window.Skylings, bundled by build.mjs). */
(() => {
  "use strict";
  const SK = window.Skylings;
  const TWINKLE = SK.COMPANIONS.find((c) => c.key === "star");
  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const BOT = Q.has("bot");
  const DEBUG = Q.has("debug");
  const RM = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const SPEED = clamp(Number(Q.get("speed")) || 1, 1, 20);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const TAU = Math.PI * 2;

  // ---------- tuning ----------
  const FIELD = 560; // the playfield's width (world units)
  const REACH = 300; // how far Twinkle can zip, from the star it stands on
  const ZIP = 1900; // zip speed
  const STAND = 34; // Twinkle's middle above the star it stands on
  const GRAV = 950;
  const U = 3.4; // world units per skyling pixel
  const STAR = 46; // a star's size
  const TAP = 46; // how close (screen px) a tap must land to a star: you tap the star you mean
  // the sea is felt from the first tap (it starts close and rises at once), then speeds up gently: no sudden wall
  const seaBase = (t) => Math.min(440, 50 + 1.05 * t);
  const SEA_LEASH = 480; // the sea never trails further than this below you
  const SEA_CALM = 200; // how far a finished shape pushes the sea back
  // the sky changes as you climb: one new thing at a time, each told once when it comes into view
  const SWAY_FROM = 1500;
  const STORM_FROM = 3500;
  const TWINKLE_FROM = 6000;
  const SHOOT_FROM = 8500;
  const ZONES = [
    { h: SWAY_FROM, title: "The sky sways", sub: "Stars move now. Time your taps" },
    { h: STORM_FROM, title: "Storm clouds", sub: "They stop a zip. Go around them" },
    { h: TWINKLE_FROM, title: "Twinkling stars", sub: "Catch them while they glow" },
    { h: SHOOT_FROM, title: "Shooting stars", sub: "Catch one for a big bonus" },
    { h: 11500, title: "Higher still", sub: "Everything a little faster" },
  ];
  const LAST_CHANCE = 0.75; // seconds to jump away once the sea reaches Twinkle's star

  // ---------- this browser only ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("starlight." + k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("starlight." + k, JSON.stringify(v));
      } catch {}
    },
  };
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- pictures ----------
  const cache = new Map();
  function sprite(pose, frame) {
    const n = SK.FRAMES[pose].length;
    const f = ((frame % n) + n) % n;
    const id = `tw|${pose}|${f}`;
    let cv = cache.get(id);
    if (cv) return cv;
    cv = document.createElement("canvas");
    cv.width = cv.height = 24;
    const g = cv.getContext("2d");
    const px = SK.pixels(TWINKLE, pose, f, true).filter(([, y]) => y < 23);
    // a pale moonlit rim keeps Twinkle visible on the night sky (as the app draws it)
    const filled = new Set(px.map(([x, y]) => x + "," + y));
    g.fillStyle = "#86a8de";
    for (const k of filled) {
      const [x, y] = k.split(",").map(Number);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        if (!filled.has(x + dx + "," + (y + dy))) g.fillRect(x + dx, y + dy, 1, 1);
    }
    for (const [x, y, col] of px) {
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
    cache.set(id, cv);
    return cv;
  }
  function art(id, rows, pal) {
    let cv = cache.get(id);
    if (cv) return cv;
    cv = document.createElement("canvas");
    cv.width = Math.max(...rows.map((r) => r.length));
    cv.height = rows.length;
    const g = cv.getContext("2d");
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const col = pal[ch] ?? SK.PAL[ch];
        if (ch !== "." && col) {
          g.fillStyle = col;
          g.fillRect(x, y, 1, 1);
        }
      }),
    );
    cache.set(id, cv);
    return cv;
  }
  const STAR_PAL = {
    dim: { k: "#4d5f80", y: "#e3ebf7" },
    near: { k: "#3b4a6a", y: "#fff8e2" },
    lit: { k: "#5a3d10", y: "#ffdc6e" },
    dark: { k: "#27324d", y: "#3d4d70" },
    out: { k: "#2b3550", y: "#56627a" },
    glow: { k: "#3b4a8a", y: "#d8e6ff" },
  };
  const starArt = (st) => art("star" + st, SK.STAR_ICON, STAR_PAL[st]);
  const cloudArt = (w) => art("cloud" + w, SK.cloud(w), { X: "#3a5486", S: "#2c4372" });
  const stormArt = (w) => art("storm" + w, SK.cloud(w), { X: "#2f3446", S: "#1d2130" });
  function glowArt(col) {
    const id = "glow" + col;
    let cv = cache.get(id);
    if (cv) return cv;
    cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col);
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    cache.set(id, cv);
    return cv;
  }

  // ---------- sound, made in code ----------
  const Sound = (() => {
    let ac = null;
    let out = null;
    let noiseBuf = null;
    let on = store.get("sound", true);
    function unlock() {
      if (!on) return;
      try {
        if (!ac) {
          ac = new (window.AudioContext || window.webkitAudioContext)();
          out = ac.createGain();
          out.gain.value = 0.55;
          const comp = ac.createDynamicsCompressor();
          out.connect(comp);
          comp.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
          const d = noiseBuf.getChannelData(0);
          for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === "suspended") ac.resume();
      } catch {
        ac = null;
      }
    }
    function tone(freq, dur, o = {}) {
      if (!ac || !on) return;
      const t0 = ac.currentTime + (o.at || 0);
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = o.type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * o.slide), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t0 + (o.attack || 0.006));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(out);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
    function noise(dur, o = {}) {
      if (!ac || !on) return;
      const t0 = ac.currentTime + (o.at || 0);
      const src = ac.createBufferSource();
      src.buffer = noiseBuf;
      const f = ac.createBiquadFilter();
      f.type = o.type || "bandpass";
      f.frequency.setValueAtTime(o.freq || 1000, t0);
      if (o.sweep) f.frequency.exponentialRampToValueAtTime(o.freq * o.sweep, t0 + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(out);
      src.start(t0);
      src.stop(t0 + dur + 0.05);
    }
    const PENT = [0, 2, 4, 7, 9];
    const note = (i) => 392 * 2 ** ((12 * Math.floor(i / 5) + PENT[((i % 5) + 5) % 5]) / 12);
    return {
      unlock,
      get on() {
        return on;
      },
      toggle() {
        on = !on;
        store.set("sound", on);
        if (on) unlock();
      },
      zip: () => noise(0.12, { vol: 0.07, freq: 1800, sweep: 2 }),
      star: (i) => {
        tone(note(i), 0.5, { vol: 0.18 });
        tone(note(i) * 2, 0.2, { vol: 0.04 });
      },
      relight: () => tone(330, 0.08, { type: "triangle", vol: 0.06 }),
      no: () => tone(196, 0.12, { type: "triangle", vol: 0.08, slide: 0.8 }),
      shape: (notes) => {
        notes.forEach((n, i) => tone(note(n), 0.45, { vol: 0.12, at: i * 0.07 }));
        noise(0.6, { vol: 0.06, freq: 500, type: "lowpass", at: 0.1 });
      },
      catch: () => {
        tone(note(10), 0.15, { type: "triangle", vol: 0.1 });
        tone(note(12), 0.3, { type: "triangle", vol: 0.1, at: 0.06 });
      },
      warn: () => tone(110, 0.25, { vol: 0.08, slide: 0.9 }),
      splash: () => noise(0.7, { vol: 0.25, freq: 900, type: "lowpass", sweep: 0.3 }),
      best: () => [0, 2, 4, 7, 9, 12].forEach((s, i) => tone(note(5 + i), 0.35, { type: "triangle", vol: 0.1, at: i * 0.07 })),
    };
  })();
  const buzz = (ms) => {
    try {
      navigator.vibrate?.(ms);
    } catch {}
  };

  // ---------- screen ----------
  const cv = $("c");
  const ctx = cv.getContext("2d");
  let W = 0;
  let H = 0;
  let DPR = 1;
  let SC = 1;
  let VW = 0;
  let VH = 0;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    SC = Math.min(W / FIELD, H / 900);
    VW = W / SC;
    VH = H / SC;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- shapes in the stars (the cloud's own things) ----------
  const SHAPES = [
    {
      name: "The Kite",
      pts: [
        [0.5, 0],
        [0.86, 0.36],
        [0.5, 0.72],
        [0.14, 0.36],
        [0.62, 1],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [2, 4],
      ],
    },
    {
      name: "The Teacup",
      pts: [
        [0, 0.25],
        [0.78, 0.25],
        [0.66, 0.9],
        [0.12, 0.9],
        [1, 0.52],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [1, 4],
        [4, 2],
      ],
    },
    {
      name: "The Little Ship",
      pts: [
        [0, 0.62],
        [1, 0.62],
        [0.8, 1],
        [0.2, 1],
        [0.5, 0],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 0],
        [4, 1],
      ],
    },
    {
      name: "The Swing",
      pts: [
        [0.12, 0],
        [0.88, 0],
        [0.32, 0.9],
        [0.68, 0.9],
      ],
      edges: [
        [0, 2],
        [1, 3],
        [2, 3],
      ],
    },
    {
      name: "The Balloon",
      pts: [
        [0.5, 0],
        [0.92, 0.32],
        [0.6, 0.66],
        [0.4, 0.66],
        [0.08, 0.32],
        [0.5, 1],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 0],
        [2, 5],
        [3, 5],
      ],
    },
    {
      name: "The Telescope",
      pts: [
        [0, 0.95],
        [0.36, 0.6],
        [0.7, 0.28],
        [1, 0],
        [0.36, 1],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [1, 4],
      ],
    },
    {
      name: "Puff",
      pts: [
        [0, 0.85],
        [0.18, 0.38],
        [0.45, 0.12],
        [0.72, 0.32],
        [1, 0.8],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 0],
      ],
    },
    {
      name: "The Hammock",
      pts: [
        [0, 0],
        [0.25, 0.7],
        [0.5, 0.9],
        [0.75, 0.7],
        [1, 0],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
    },
  ];

  // ---------- a run ----------
  let state = "menu"; // menu | play | pause | over | end
  let G = null;
  let runs = store.get("runs", []);
  const found = new Set(store.get("found", []));
  const seen = new Set(store.get("hints", []));

  function newRun() {
    const seed = (Math.random() * 2 ** 31) | 0;
    G = {
      R: rng(seed),
      started: false,
      clock: 0,
      vt: 0,
      S: 0,
      seaDrop: 0,
      tw: { x: FIELD / 2, y: -200 - STAND, vy: 0, on: null, zip: null, fromX: 0, fromY: 0 },
      stars: [],
      shapes: [],
      genY: -200,
      prevRow: [],
      nextShapeAt: 620,
      lastShape: -1,
      score: 0,
      best: store.get("best", 0),
      passedBest: false,
      top: 200,
      noteI: 0,
      noteT: -9,
      queued: null,
      squash: 0,
      flashReach: 0,
      fx: [],
      texts: [],
      calls: [],
      ripples: [],
      trail: [],
      hints: [],
      warnT: 0,
      shootT: 6,
      shoot: null,
      cx: (FIELD - VW) / 2,
      cy: 80 - VH,
      stats: { taps: 0, far: 0, dark: 0, relit: 0, lit: 0, shapes: 0, broken: 0, catches: 0, falls: 0, close: 0, zaps: 0, shooting: 0, misses: 0, stuck: 0 },
      told: {},
      waitFor: null,
      wet: null,
      storms: [],
      zone: 0,
      shootNext: 0,
      perf: { frames: 0, sum: 0, worst: 0, slow: 0 },
      newFound: [],
      botT: 0.6,
      stuckT: 0,
    };
    const first = addStar(FIELD / 2, -200, {});
    first.lit = true;
    G.tw.on = first;
    G.prevRow = [first];
    gen(G.cy - 400);
  }

  function addStar(x, y, o) {
    const s = { x, y, lit: false, out: false, shape: null, twinkle: false, ph: G.R(), shake: 0, litT: -9, ...o };
    G.stars.push(s);
    return s;
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // every star in the row below must reach at least one new star: nobody is ever stuck with no way up
  function cover(prev, fresh) {
    const R = G.R;
    for (const p of prev) {
      if (fresh.some((s) => dist(s, p) < REACH * 0.84 && !blocked(p, s))) continue;
      const top = Math.min(...fresh.map((s) => s.y));
      const dy = Math.max(60, p.y - top);
      const span = Math.sqrt(Math.max(0, (REACH * 0.8) ** 2 - dy * dy));
      fresh.push(addStar(clamp(p.x + (R() - 0.5) * 2 * span * 0.8, 50, FIELD - 50), p.y - dy, {}));
    }
    return fresh;
  }
  function gen(upTo) {
    while (G.genY > upTo) {
      const h = -G.genY;
      if (h > G.nextShapeAt) placeShape();
      else addRow(h);
    }
  }
  function addRow(h) {
    const R = G.R;
    const hard = clamp((h - 400) / 9000, 0, 1);
    G.genY -= lerp(100, 150, hard) * (0.85 + R() * 0.3);
    const n = 1 + (R() < 0.7 - hard * 0.3 ? 1 : 0);
    // a swaying row: every star in it moves together, side to side
    const sh = clamp((h - SWAY_FROM) / 9000, 0, 1);
    const sway =
      h > SWAY_FROM && R() < lerp(0.5, 0.85, sh)
        ? { amp: lerp(55, 125, sh) * (0.6 + R() * 0.4), w: (TAU / lerp(4.6, 2.6, sh)) * (R() < 0.5 ? 1 : -1), phi: R() * TAU }
        : null;
    const margin = 50 + (sway ? sway.amp : 0);
    const xs = [];
    for (let i = 0; i < n; i++) {
      let x = 0;
      for (let k = 0; k < 12; k++) {
        x = margin + R() * (FIELD - 2 * margin);
        if (xs.every((o) => Math.abs(o - x) > 130)) break;
      }
      xs.push(x);
    }
    const tw = h > TWINKLE_FROM ? lerp(0.25, 0.5, clamp((h - TWINKLE_FROM) / 6000, 0, 1)) : 0;
    const row = xs.map((x) => {
      const o = { twinkle: R() < tw, bx: x };
      if (sway) Object.assign(o, { amp: sway.amp, w: sway.w, phi: sway.phi });
      const st = addStar(x, G.genY + (R() - 0.5) * 30, o);
      moveStar(st);
      return st;
    });
    cover(G.prevRow, row);
    if (h < TWINKLE_FROM + 3000 && row.every((s) => s.twinkle)) row[0].twinkle = false;
    // a storm cloud sits in the row, level with where Twinkle stands, and blocks the zips that cross it; it never
    // closes the way up, and never drifts onto a star
    if (h > STORM_FROM && R() < lerp(0.45, 0.7, clamp((h - STORM_FROM) / 8000, 0, 1))) {
      const cw = 30 + ((R() * 10) | 0);
      const storm = { x: 0, bx: 0, y: G.genY - STAND, cw, rx: cw * 2 * 0.92, ry: 24, amp: 20 + R() * 25, w: TAU / (5 + R() * 3), phi: R() * TAU };
      for (let k = 0; k < 12; k++) {
        storm.bx = 70 + R() * (FIELD - 140);
        storm.x = storm.bx;
        const clear = row.every((st) => Math.abs((st.bx ?? st.x) - storm.bx) > storm.rx + storm.amp + (st.amp || 0) + 40);
        const open = G.prevRow.every((p) => row.some((st) => dist(st, p) <= REACH * 0.84 && !blockedBy(storm, p, st)));
        if (clear && open) {
          G.storms.push(storm);
          break;
        }
      }
    }
    G.prevRow = row;
  }
  function moveStar(st) {
    if (st.amp) st.x = st.bx + st.amp * Math.sin(G.clock * st.w + st.phi);
  }
  // does the straight zip from a to b pass through this storm?
  function blockedBy(storm, a, b) {
    for (let i = 1; i < 12; i++) {
      const t = i / 12;
      const x = lerp(a.x, b.x, t);
      const y = lerp(a.y - STAND, b.y - STAND, t);
      const nx = (x - storm.x) / (storm.rx + 8);
      const ny = (y - storm.y) / (storm.ry + 14);
      if (nx * nx + ny * ny < 1) return true;
    }
    return false;
  }
  const blocked = (a, b) => G.storms.some((st) => blockedBy(st, a, b));
  function placeShape() {
    const R = G.R;
    let si = (R() * SHAPES.length) | 0;
    if (si === G.lastShape) si = (si + 1) % SHAPES.length;
    G.lastShape = si;
    const sh = SHAPES[si];
    const w = 220 + R() * 80;
    const hh = 180 + R() * 70;
    const left = R() < 0.5;
    const x0 = left ? 50 + R() * 30 : FIELD - 50 - w - R() * 30;
    const bottom = G.genY - 125;
    const top = bottom - hh;
    const order = sh.pts.map((p, k) => [p[0] + p[1] * 0.01, k]).sort((a, b) => a[0] - b[0]);
    const con = { name: sh.name, stars: [], edges: sh.edges, done: false, broken: false };
    sh.pts.forEach(([px, py], k) => {
      const s = addStar(x0 + px * w, top + py * hh, { shape: con, note: order.findIndex((o) => o[1] === k) });
      con.stars.push(s);
    });
    G.shapes.push(con);
    // a way past it on the other side, for when climbing matters more
    const bx0 = left ? x0 + w + 70 : 50;
    const bx1 = left ? FIELD - 50 : x0 - 70;
    const bypass = [];
    if (bx1 - bx0 > 20) for (let yy = bottom - 10; yy > top - 20; yy -= 125) bypass.push(addStar(bx0 + R() * (bx1 - bx0), yy, {}));
    cover(G.prevRow, [...con.stars, ...bypass]);
    G.genY = top;
    G.prevRow = [...con.stars.filter((s) => s.y < top + hh * 0.4), ...bypass.slice(-1)];
    G.nextShapeAt = -G.genY + 600 + R() * 450;
  }

  // a twinkling star you stand on stays lit (Twinkle's own light); twinkling only decides when you can jump to it
  const phase = (s) => (((G.clock * 0.55 + s.ph) % 1) + 1) % 1;
  const glowing = (s) => !s.twinkle || s === G.tw.on || phase(s) < 0.65;
  const fading = (s) => s.twinkle && s !== G.tw.on && phase(s) > 0.53 && phase(s) < 0.65;
  const feet = () => ({ x: G.tw.x, y: G.tw.y + STAND });

  // ---------- the move ----------
  // You tap the star you mean. A star out of reach shakes and the reach ring flashes; a tap on empty sky does nothing.
  function tapAt(sx, sy) {
    if (state !== "play") return;
    Sound.unlock();
    G.stats.taps++;
    const s = resolveTap(G.cx + sx / SC, G.cy + sy / SC);
    if (!s) return;
    if (G.tw.zip) {
      G.queued = s;
      return;
    }
    go(s);
  }
  function resolveTap(wx, wy) {
    const f = feet();
    const can = (s) => !s.out && s !== G.tw.on;
    let under = null;
    let ud = TAP;
    for (const s of G.stars) {
      if (!can(s)) continue;
      const d = Math.hypot(s.x - wx, s.y - wy) * SC;
      if (d < ud) {
        ud = d;
        under = s;
      }
    }
    if (under && dist(under, f) <= REACH) return under;
    if (under) {
      G.stats.far++;
      G.flashReach = 0.6;
      under.shake = 0.3;
      Sound.no();
      if (tell("far")) text(under.x, under.y - 40, "Too far", "#ffffff", 22);
    } else {
      G.stats.misses++;
      G.ripples.push({ x: wx, y: wy, life: 0.35 });
    }
    return null;
  }
  // the first few times a rule bites, say it in two words
  function tell(id) {
    G.told[id] = (G.told[id] || 0) + 1;
    return G.told[id] <= 3;
  }
  function go(s) {
    const f = feet();
    if (dist(s, f) > REACH) return;
    if (!glowing(s)) {
      // wait for it: Twinkle jumps the moment it glows
      G.waitFor = { s, until: G.clock + 1.3 };
      G.stats.dark++;
      if (tell("dark")) text(s.x, s.y - 40, "Wait for the glow", "#d8e6ff", 22);
      return;
    }
    G.waitFor = null;
    const tw = G.tw;
    if (G.wet != null) {
      G.wet = null;
      G.stats.close++;
      text(tw.x, tw.y - 60, "Close one!", "#86d3a0", 26);
    }
    tw.fromX = tw.x;
    tw.fromY = tw.y;
    tw.zip = s;
    // a zip that starts touching a storm isn't stopped by that one
    tw.zipFrom = G.storms.find((sm) => ((tw.x - sm.x) / (sm.rx + 8)) ** 2 + ((tw.y - sm.y) / (sm.ry + 14)) ** 2 < 1) || null;
    tw.falling = !tw.on;
    tw.on = null;
    Sound.zip();
    if (!G.started) G.started = true;
  }
  function arrive(s) {
    const tw = G.tw;
    tw.x = s.x;
    tw.y = s.y - STAND;
    tw.vy = 0;
    tw.on = s;
    tw.zip = null;
    G.squash = 1;
    burst(s.x, s.y, s.lit ? "#cfe0ff" : "#ffdc6e", s.lit ? 4 : 12, s.lit ? 120 : 240, 5);
    if (tw.falling) {
      G.stats.catches++;
      text(s.x, s.y - 70, "Caught it!", "#cfe0ff", 26);
      Sound.catch();
    }
    if (s.shooting) {
      s.shooting = false;
      s.vx = 0;
      G.stats.shooting++;
      G.score += 10;
      G.seaDrop += 260;
      call("Shooting star!", "+10 stars · the sea calms", "#ffdc6e");
      Sound.best();
    }
    if (!s.lit) light(s);
    else {
      G.stats.relit++;
      Sound.relight();
    }
    G.top = Math.max(G.top, -s.y);
    if (G.queued) {
      const q = G.queued;
      G.queued = null;
      if (!q.out && q !== s) go(q);
    }
  }
  function light(s) {
    s.lit = true;
    s.litT = G.clock;
    G.stats.lit++;
    G.score += 1;
    bumpScore();
    // quick taps climb the scale, a pause starts it again
    G.noteI = G.clock - G.noteT < 1.3 ? Math.min(G.noteI + 1, 12) : 0;
    G.noteT = G.clock;
    Sound.star(s.shape ? s.note + 2 : G.noteI);
    buzz(6);
    const c = s.shape;
    if (c && !c.done && !c.broken && c.stars.every((x) => x.lit)) {
      c.done = true;
      G.stats.shapes++;
      const n = c.stars.length;
      G.score += n;
      bumpScore();
      G.seaDrop += SEA_CALM;
      if (!found.has(c.name)) {
        found.add(c.name);
        G.newFound.push(c.name);
        store.set("found", [...found]);
      }
      call(c.name, `+${n} stars · the sea calms`, "#ffdc6e");
      Sound.shape(c.stars.map((x) => x.note + 2).sort((a, b) => a - b));
      for (const x of c.stars) burst(x.x, x.y, "#fff3c4", 10, 220, 6);
      buzz(18);
    }
    if (!G.passedBest && G.best > 0 && G.score > G.best) {
      G.passedBest = true;
      call("New best!", "Keep going", "#86d3a0");
      Sound.best();
    }
  }

  // ---------- one step ----------
  function step(dt) {
    const tw = G.tw;
    if (G.started) G.clock += dt;
    // the sky moves: swaying rows, drifting storms, shooting stars
    for (const st of G.stars) {
      moveStar(st);
      if (st.vx) st.x += st.vx * dt;
    }
    for (const sm of G.storms) sm.x = sm.bx + sm.amp * Math.sin(G.clock * sm.w + sm.phi);
    if (G.stars.some((st) => st.vx && (st.x < -90 || st.x > FIELD + 90))) G.stars = G.stars.filter((st) => !st.vx || (st.x > -90 && st.x < FIELD + 90));
    if (G.top > SHOOT_FROM && G.started && G.clock > G.shootNext) {
      const dir = G.R() < 0.5 ? 1 : -1;
      addStar(dir > 0 ? -60 : FIELD + 60, tw.y - 140 - G.R() * 170, { vx: dir * (260 + G.R() * 120), shooting: true });
      G.shootNext = G.clock + 9 + G.R() * 7;
    }
    if (tw.on && !tw.zip) {
      tw.x = tw.on.x;
      tw.y = tw.on.y - STAND;
    }
    // a new part of the sky comes into view: say what's new, once
    if (G.zone < ZONES.length && -G.cy > ZONES[G.zone].h + 150) {
      const z = ZONES[G.zone++];
      call(z.title, z.sub, "#d8e6ff");
      Sound.catch();
    }
    // the sea rises; it never trails too far behind you
    if (G.started) {
      const gap = G.S - feet().y;
      G.S -= (seaBase(G.clock) + Math.max(0, gap - SEA_LEASH) * 1.6) * dt;
      if (G.seaDrop > 0) {
        const k = Math.min(G.seaDrop, 340 * dt);
        G.S = Math.min(G.S + k, feet().y + SEA_LEASH);
        G.seaDrop -= k;
      }
    }
    // Twinkle
    if (tw.zip) {
      const s = tw.zip;
      const tx = s.x;
      const ty = s.y - STAND;
      const d = Math.hypot(tx - tw.x, ty - tw.y);
      const stepLen = ZIP * dt;
      G.trail.push({ x: tw.x, y: tw.y, life: 0.25 });
      const inside = (sm) => ((tw.x - sm.x) / (sm.rx + 8)) ** 2 + ((tw.y - sm.y) / (sm.ry + 14)) ** 2 < 1;
      const hit = G.storms.find((sm) => sm !== tw.zipFrom && inside(sm));
      if (hit) {
        // a storm stops the zip: Twinkle drops, and a quick tap can still catch a star
        tw.zip = null;
        tw.vy = 140;
        G.queued = null;
        G.stats.zaps++;
        G.flashReach = 0.3;
        text(tw.x, tw.y - 50, "Zap!", "#ffc1b4", 28);
        burst(tw.x, tw.y, "#d8e6ff", 10, 260, 5);
        Sound.no();
        buzz(25);
      } else if (d <= stepLen) arrive(s);
      else {
        tw.x += ((tx - tw.x) / d) * stepLen;
        tw.y += ((ty - tw.y) / d) * stepLen;
      }
    } else if (tw.on) {
      // a tap that's waiting for a twinkling star to glow
      const w = G.waitFor;
      if (w) {
        if (w.s.out || G.clock > w.until) G.waitFor = null;
        else if (glowing(w.s)) go(w.s);
      }
    } else {
      tw.vy = Math.min(tw.vy + GRAV * dt, 900);
      tw.y += tw.vy * dt;
    }
    // stars the sea reaches go out
    for (const s of G.stars) {
      if (!s.out && s.y > G.S - 8) {
        s.out = true;
        if (s.shape && !s.shape.done && !s.shape.broken) {
          s.shape.broken = true;
          G.stats.broken++;
        }
        if (s.y < G.cy + VH + 40) burst(s.x, G.S, "#9fb4d8", 4, 80, 4);
      }
    }
    // the sea reaches Twinkle: a last moment to jump away, then caught
    if (!tw.zip && G.wet == null && tw.y + STAND * 0.6 > G.S) {
      G.wet = LAST_CHANCE;
      text(tw.x, tw.y - 64, "Jump!", "#ffc1b4", 32);
      Sound.warn();
      buzz(20);
    }
    if (G.wet != null && !tw.zip) {
      G.wet -= dt;
      tw.y += 50 * dt;
      if (G.wet <= 0) return over();
    }
    // hints, once per device
    hint("tap", true);
    if (G.started) {
      const vis = (s) => s.y > G.cy + 120 / SC && s.y < G.cy + VH - 60;
      const sh = G.shapes.find((c) => !c.done && !c.broken && c.stars.every(vis));
      if (sh) hint("shape", sh);
      if (G.clock > 1.2) hint("sea", true);
    }
    // danger hum
    G.warnT -= dt;
    const gapNow = G.S - feet().y;
    if (G.started && gapNow < 240 && G.warnT <= 0) {
      Sound.warn();
      G.warnT = 0.3 + 0.7 * clamp(gapNow / 240, 0, 1);
    }
    // stuck check (for the bot's fairness report): standing with no way up
    if (BOT && tw.on && !tw.zip) {
      const f = feet();
      const up = G.stars.some((s) => !s.out && s !== tw.on && s.y < f.y - 20 && dist(s, f) <= REACH);
      G.stuckT = up ? 0 : G.stuckT + dt;
      if (G.stuckT > 2.5) {
        G.stats.stuck++;
        G.stuckT = -99;
      }
    }
    gen(G.cy - 500);
    if (G.stars.length > 400) G.stars = G.stars.filter((s) => s.y < G.S + 300 || s.shape);
  }

  function hint(id, what) {
    if (seen.has(id) || G.hints.some((h) => h.id === id)) return;
    if (id === "tap" && G.started) return;
    G.hints.push({ id, what, life: id === "tap" ? 999 : 3.2 });
    seen.add(id);
    if (!BOT) store.set("hints", [...seen]);
  }

  // ---------- feedback ----------
  function burst(x, y, col, n, sp, size = 5) {
    if (G.fx.length > 400) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = sp * (0.4 + Math.random() * 0.8);
      G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.35, max: 0.8, size: size * (0.6 + Math.random() * 0.8), col });
    }
  }
  function text(x, y, s, col, size = 24) {
    G.texts.push({ x, y, s, col, size, life: 0.9 });
  }
  function call(s, sub, col) {
    G.calls.push({ s, sub, col, life: 1.6 });
    if (G.calls.length > 2) G.calls.shift();
  }
  let bumpT = 0;
  function bumpScore() {
    $("scoreN").textContent = fmt(G.score);
    if (RM) return;
    const el = $("score");
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
    bumpT = 0;
  }

  // ---------- input ----------
  cv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state === "end") return;
    tapAt(e.clientX, e.clientY);
  });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "Enter") {
      if (state === "end" && e.code === "Space") {
        e.preventDefault();
        play();
      }
    }
    if (e.code === "Escape" && state === "play") pause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "play") pause();
  });

  // the star a sensible player would pick next (the bot)
  function botPick() {
    const tw = G.tw;
    const f = feet();
    let best = null;
    let bs = -1e9;
    const gap = G.S - f.y;
    for (const s of G.stars) {
      if (s.out || s === tw.on || dist(s, f) > REACH || !glowing(s) || blocked(f, s)) continue;
      let sc = f.y - s.y;
      if (s.shooting) sc += 600;
      if (!s.lit) sc += 80;
      if (s.shape && !s.shape.done && !s.shape.broken) sc += !s.lit && gap > 280 ? 380 : 150;
      if (s.twinkle) sc -= fading(s) ? 400 : 60;
      if (gap < 260) sc += (f.y - s.y) * 2;
      if (sc > bs) {
        bs = sc;
        best = s;
      }
    }
    return best;
  }
  // ?bot=1 plays well; ?bot=human taps like a first-timer: slower, and now and then a so-so choice
  const HUMAN = Q.get("bot") === "human";
  function bot() {
    if (G.tw.zip) return;
    G.botT -= 1 / 120;
    if (G.botT > 0 && G.tw.on) return;
    G.botT = HUMAN ? 0.55 + Math.random() * 0.45 : 0.2 + Math.random() * 0.25;
    let s = botPick();
    if (HUMAN && Math.random() < 0.2) {
      const f = feet();
      const any = G.stars.filter((x) => !x.out && x !== G.tw.on && dist(x, f) <= REACH);
      if (any.length) s = any[(Math.random() * any.length) | 0];
    }
    if (s) go(s);
    if (BOT && G.clock > (Number(Q.get("cap")) || 1e9)) G.S = G.tw.y - 200;
  }

  // ---------- drawing ----------
  const BG = Array.from({ length: 150 }, (_, i) => {
    const r = rng(i * 7919 + 3);
    return { x: r(), y: r(), s: r() < 0.12 ? 2 : 1, ph: r() * TAU, d: 0.08 + r() * 0.2 };
  });
  const CLOUDS = Array.from({ length: 6 }, (_, i) => {
    const r = rng(i * 104729 + 5);
    return { x: r(), y: r(), w: 24 + ((r() * 16) | 0), sp: 6 + r() * 10 };
  });
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const SKY = [
    [0, "#1b3263", "#4b5f8c", "#e2643f"],
    [0.12, "#1a2d5a", "#344c7c", "#7a6f8e"],
    [0.35, "#142451", "#233c6e", "#3a5a8f"],
    [1, "#0f1d45", "#182f5f", "#2b4677"],
  ].map(([p, ...c]) => [p, ...c.map(hex)]);
  const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c, al = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
  function skyAt(p) {
    for (let i = 1; i < SKY.length; i++)
      if (p <= SKY[i][0]) {
        const t = (p - SKY[i - 1][0]) / (SKY[i][0] - SKY[i - 1][0]);
        return [1, 2, 3].map((k) => mixc(SKY[i - 1][k], SKY[i][k], t));
      }
    return SKY[SKY.length - 1].slice(1);
  }

  function render(dt) {
    const g = G;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const h = g ? Math.max(0, -(g.cy + VH)) : 0;
    const [top, mid, hor] = skyAt(clamp(h / 9000, 0, 1));
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, css(top));
    sky.addColorStop(0.6, css(mid));
    sky.addColorStop(1, css(hor));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const vt = g ? g.vt : performance.now() / 1000;
    const cyPx = g ? g.cy * SC : 0;
    // far stars
    for (const s of BG) {
      const y = (((s.y * H * 1.4 - cyPx * s.d) % (H * 1.4)) + H * 1.4) % (H * 1.4);
      if (y > H) continue;
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(vt * 1.6 + s.ph);
      ctx.fillStyle = "#eef3ff";
      ctx.fillRect(s.x * W, y, s.s * 1.5, s.s * 1.5);
    }
    ctx.globalAlpha = 1;
    // the moon, a little bigger the higher you climb
    const mr = Math.max(26, (30 + Math.min(34, h / 260)) * Math.min(1, SC * 1.3));
    const mx = W * 0.8;
    const my = H * 0.17 + mr * 0.2;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.45;
    ctx.drawImage(glowArt("rgba(200,220,255,0.8)"), mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#e9eefb";
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#c9d3ea";
    for (const [a, b, r] of [
      [-0.3, -0.2, 0.18],
      [0.25, 0.15, 0.13],
      [-0.05, 0.4, 0.1],
      [0.35, -0.35, 0.08],
    ]) {
      ctx.beginPath();
      ctx.arc(mx + a * mr, my + b * mr, r * mr, 0, TAU);
      ctx.fill();
    }
    // night clouds drift by
    ctx.imageSmoothingEnabled = false;
    for (const c of CLOUDS) {
      const w = c.w * 4 * SC;
      const x = ((((c.x * (W + w * 2) + vt * c.sp) % (W + w * 2)) + (W + w * 2)) % (W + w * 2)) - w;
      const y = (((c.y * H * 1.6 - cyPx * 0.45) % (H * 1.6)) + H * 1.6) % (H * 1.6);
      if (y > H) continue;
      ctx.globalAlpha = 0.32;
      ctx.drawImage(cloudArt(c.w), x, y, w, 28 * SC);
    }
    ctx.globalAlpha = 1;
    // a shooting star now and then
    if (g) {
      g.shootT -= dt;
      if (g.shootT <= 0 && !g.shoot) {
        g.shoot = { x: Math.random() * W * 0.6, y: Math.random() * H * 0.3, life: 0.7 };
        g.shootT = 9 + Math.random() * 8;
      }
      if (g.shoot && !RM) {
        const s = g.shoot;
        s.life -= dt;
        const k = 1 - s.life / 0.7;
        ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(s.x + k * 260, s.y + k * 110);
        ctx.lineTo(s.x + k * 260 - 70, s.y + k * 110 - 30);
        ctx.stroke();
        if (s.life <= 0) g.shoot = null;
      } else if (g.shoot) g.shoot = null;
    }
    if (!g || state === "menu") {
      drawSea(0, H * 0.82, vt, 1e9);
      return;
    }
    // the world
    ctx.setTransform(DPR * SC, 0, 0, DPR * SC, -g.cx * SC * DPR, -g.cy * SC * DPR);
    drawWorld(vt);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawSea((g.S - g.cy) * SC, (g.S - g.cy) * SC, vt, g.S - feet().y);
    // the sea is close: a warm glow rises from the bottom and pulses faster the closer it gets
    const gapNow = g.S - feet().y;
    if (g.started && state === "play" && gapNow < 240) {
      const k = 1 - clamp(gapNow / 240, 0, 1);
      const pulse = RM ? 1 : 0.6 + 0.4 * Math.sin(vt * (5 + 9 * k));
      const gr = ctx.createLinearGradient(0, H * 0.5, 0, H);
      gr.addColorStop(0, "rgba(255,150,120,0)");
      gr.addColorStop(1, `rgba(255,150,120,${(0.32 * k * pulse).toFixed(3)})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, H * 0.5, W, H * 0.5);
    }
    drawCalls();
    if (DEBUG) {
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`fps ${(1 / Math.max(dt, 0.001)).toFixed(0)} t ${g.clock.toFixed(1)} gap ${(g.S - feet().y) | 0} sea ${seaBase(g.clock) | 0}/s`, 10, H - 12);
    }
  }

  function drawSea(y, _y2, vt, gap) {
    if (y > H + 40) {
      // below the screen: a soft glow says where it is
      ctx.globalAlpha = clamp(1 - (y - H) / 500, 0, 0.6);
      const gr = ctx.createLinearGradient(0, H - 60, 0, H);
      gr.addColorStop(0, "rgba(120,170,255,0)");
      gr.addColorStop(1, "rgba(120,170,255,0.8)");
      ctx.fillStyle = gr;
      ctx.fillRect(0, H - 60, W, 60);
      ctx.globalAlpha = 1;
      return;
    }
    const gr = ctx.createLinearGradient(0, y, 0, H);
    gr.addColorStop(0, "#3a5a8f");
    gr.addColorStop(1, "#14234a");
    ctx.fillStyle = gr;
    ctx.fillRect(0, y, W, H - y + 2);
    // the surface, glowing when it's close
    const near = clamp(1 - (gap - 100) / 200, 0, 1);
    ctx.fillStyle = `rgba(255,255,255,${0.5 + 0.3 * near * (0.5 + 0.5 * Math.sin(vt * 9))})`;
    ctx.fillRect(0, y - 1.5, W, 3);
    // the moon on the water
    ctx.fillStyle = "rgba(220,232,255,0.45)";
    for (let i = 0; i < 7; i++) {
      const ww = 60 - i * 6 + Math.sin(vt * 2 + i) * 8;
      ctx.fillRect(W * 0.8 - ww / 2 + Math.sin(vt * 1.3 + i * 2) * 6, y + 8 + i * 11, ww, 3);
    }
    ctx.fillStyle = "rgba(255,255,255,0.16)";
    for (let i = 0; i < 12; i++) ctx.fillRect(((i * 97 + vt * 14) % (W + 40)) - 20, y + 20 + ((i * 37) % 70), 24, 2);
  }

  function drawWorld(vt) {
    const g = G;
    const tw = g.tw;
    const f = feet();
    const L = g.cy - 80;
    const B = g.cy + VH + 80;
    const inView = (s) => s.y > L && s.y < B;
    ctx.imageSmoothingEnabled = false;
    // shape lines
    for (const c of g.shapes) {
      if (!c.stars.some(inView)) continue;
      for (const [a, b] of c.edges) {
        const A = c.stars[a];
        const Bs = c.stars[b];
        const both = A.lit && Bs.lit;
        ctx.strokeStyle = c.done ? "rgba(255,220,110,0.95)" : c.broken ? "rgba(255,255,255,0.08)" : both ? "rgba(255,236,170,0.75)" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = c.done ? 4 : 2.5;
        ctx.setLineDash(both || c.done ? [] : [6, 9]);
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(Bs.x, Bs.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // the reach: a faint ring around the star Twinkle stands on
    if (state === "play") {
      g.flashReach = Math.max(0, g.flashReach - 1 / 60);
      ctx.strokeStyle = `rgba(207,224,255,${0.13 + g.flashReach * 0.8})`;
      ctx.lineWidth = 2 + g.flashReach * 3;
      ctx.setLineDash([5, 10]);
      ctx.beginPath();
      ctx.arc(f.x, f.y, REACH, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // the zip's streak
    for (const t of g.trail) {
      t.life -= 1 / 60;
      ctx.globalAlpha = clamp(t.life * 4, 0, 1) * 0.6;
      ctx.fillStyle = "#cfe0ff";
      ctx.fillRect(t.x - 5, t.y - 5, 10, 10);
    }
    g.trail = g.trail.filter((t) => t.life > 0);
    ctx.globalAlpha = 1;
    // storm clouds: rain behind, a slow flash, a grumpy face
    for (const sm of g.storms) {
      if (sm.y < L || sm.y > B) continue;
      const w = sm.cw * 4;
      // a faint lightning glow behind, so a storm never reads as one of the sky's quiet clouds
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + (RM ? 0 : 0.1 * Math.sin(vt * 3 + sm.phi));
      ctx.drawImage(glowArt("rgba(255,214,140,0.8)"), sm.x - w * 0.75, sm.y - w * 0.45, w * 1.5, w * 0.9);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(190,210,245,0.75)";
      for (let i = 0; i < 8; i++) {
        const rx = sm.x - w / 2 + 14 + i * ((w - 28) / 7);
        ctx.fillRect(rx, sm.y + 14 + ((vt * 240 + i * 41) % 46), 3, 12);
      }
      ctx.drawImage(stormArt(sm.cw), sm.x - w / 2, sm.y - 16, w, 32);
      if (!RM && (vt + sm.phi) % 3.1 < 0.07) {
        ctx.strokeStyle = "#fff6c8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(sm.x + 6, sm.y + 12);
        ctx.lineTo(sm.x - 6, sm.y + 30);
        ctx.lineTo(sm.x + 4, sm.y + 33);
        ctx.lineTo(sm.x - 8, sm.y + 52);
        ctx.stroke();
      }
      ctx.fillStyle = "#e7ecf8";
      ctx.fillRect(sm.x - 13, sm.y - 2, 4, 4);
      ctx.fillRect(sm.x + 9, sm.y - 2, 4, 4);
      ctx.fillRect(sm.x - 17, sm.y - 7, 8, 3);
      ctx.fillRect(sm.x + 9, sm.y - 7, 8, 3);
    }
    // stars
    for (const s of g.stars) {
      if (s.shooting && inView(s)) {
        // a shooting star's tail
        const dir = Math.sign(s.vx);
        const gr = ctx.createLinearGradient(s.x, s.y, s.x - dir * 170, s.y);
        gr.addColorStop(0, "rgba(255,240,190,0.9)");
        gr.addColorStop(1, "rgba(255,240,190,0)");
        ctx.strokeStyle = gr;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - dir * 170, s.y);
        ctx.stroke();
      }
      if (!inView(s)) continue;
      const reach = !s.out && dist(s, f) <= REACH && s !== tw.on;
      const lightOn = glowing(s);
      let look;
      if (s.shooting) look = "lit";
      else if (s.out) look = "out";
      else if (s.twinkle && !lightOn) look = "dark";
      else if (s.lit) look = "lit";
      else if (s.twinkle) look = "glow";
      else look = reach ? "near" : "dim";
      let size = s.shooting ? STAR * 1.25 : STAR;
      if (look === "dark") size *= 0.75;
      if (look === "dim") size *= 0.86;
      if (s.lit) size *= 1 + 0.06 * Math.sin(vt * 4 + s.x);
      if (s.twinkle && lightOn) size *= 1.08;
      const flick = fading(s) && ((vt * 14) | 0) % 2 === 0;
      s.shake = Math.max(0, s.shake - 1 / 60);
      const ox = s.shake ? Math.sin(vt * 70) * 6 * (s.shake / 0.35) : 0;
      if ((look === "lit" || look === "glow" || (look === "near" && !s.lit)) && !flick) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = look === "lit" ? 0.6 : look === "glow" ? 0.55 : 0.35;
        ctx.drawImage(
          glowArt(look === "lit" ? "rgba(255,210,90,0.9)" : "rgba(210,225,255,0.9)"),
          s.x - size * 1.3 + ox,
          s.y - size * 1.3,
          size * 2.6,
          size * 2.6,
        );
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = look === "dim" ? 0.6 : flick ? 0.45 : 1;
      ctx.drawImage(starArt(look), s.x - size / 2 + ox, s.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
    // Twinkle
    if (state !== "end") {
      let pose = "idle";
      let fr = vt % 3.2 < 0.12 ? 1 : 0;
      if (tw.zip) {
        pose = "celebrate";
        fr = 2;
      } else if (!tw.on || g.wet != null || g.S - f.y < 200) {
        pose = "surprised";
        fr = 0;
      } else if (!g.started) {
        pose = "wave";
        fr = ((vt * 3) | 0) % 2;
      }
      g.squash = Math.max(0, g.squash - 0.08);
      const sx = 1 + 0.2 * g.squash;
      const sy = 1 - 0.2 * g.squash;
      const img = sprite(pose, fr);
      const s = 24 * U;
      const lean = tw.zip ? clamp((tw.zip.x - tw.x) / 600, -0.4, 0.4) : 0;
      ctx.save();
      ctx.translate(tw.x, tw.y);
      ctx.rotate(lean);
      ctx.scale(sx, sy);
      if (state === "over") ctx.globalAlpha = clamp(1 - g.overT * 1.6, 0, 1);
      ctx.drawImage(img, -12 * U, -14 * U + (1 - sy) * 30, s, s);
      ctx.restore();
    }
    // hints
    for (const hn of g.hints) {
      if (state === "play" && hn.id !== "tap") hn.life -= 1 / 60;
      let x;
      let y;
      let label;
      if (hn.id === "tap") {
        const s = botPick();
        if (!s) continue;
        x = s.x;
        y = s.y;
        label = "Tap a star to climb";
        const r = 30 + 6 * Math.sin(vt * 6);
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        y -= 46;
      } else if (hn.id === "shape") {
        const c = hn.what;
        x = c.stars.reduce((a, s) => a + s.x, 0) / c.stars.length;
        y = Math.min(...c.stars.map((s) => s.y)) - 44;
        label = "Light every star of a shape";
      } else if (hn.id === "glow") {
        x = hn.what.x;
        y = hn.what.y - 44;
        label = "Catch it while it glows";
      } else {
        x = f.x;
        y = f.y + 70;
        label = "The sea is rising. Keep climbing!";
      }
      x = clamp(x, g.cx + 150, g.cx + VW - 150);
      ctx.globalAlpha = clamp(hn.life, 0, 1);
      label3d(label, x, y, "#ffffff", 26);
      ctx.globalAlpha = 1;
    }
    g.hints = g.hints.filter((hn) => hn.life > 0 && !(hn.id === "tap" && g.started));
    // ripples where a tap hit no star
    for (const r of g.ripples) {
      r.life -= 1 / 60;
      ctx.strokeStyle = `rgba(255,255,255,${clamp(r.life * 2, 0, 1) * 0.5})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 30 - r.life * 40, 0, TAU);
      ctx.stroke();
    }
    g.ripples = g.ripples.filter((r) => r.life > 0);
    // particles and words
    for (const p of g.fx) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const t of g.texts) {
      ctx.globalAlpha = clamp(t.life * 2, 0, 1);
      label3d(t.s, t.x, t.y, t.col, t.size);
    }
    ctx.globalAlpha = 1;
  }
  function label3d(s, x, y, col, size) {
    ctx.font = `800 ${size}px Geist, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = 6;
    ctx.strokeStyle = "rgba(10,18,40,0.75)";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
  }
  function drawCalls() {
    const c = G.calls[G.calls.length - 1];
    if (!c) return;
    const a = clamp(c.life * 2, 0, 1);
    const y = Math.max(140, H * 0.19);
    const big = Math.round(clamp(W * 0.095, 30, 50));
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.font = `800 ${big}px Fraunces, ui-serif, Georgia, serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(10,18,40,0.7)";
    ctx.strokeText(c.s, W / 2, y);
    ctx.fillStyle = c.col;
    ctx.fillText(c.s, W / 2, y);
    ctx.font = `600 ${Math.round(big * 0.4)}px Geist, ui-sans-serif, system-ui, sans-serif`;
    ctx.lineWidth = 5;
    ctx.strokeText(c.sub, W / 2, y + big * 0.62);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(c.sub, W / 2, y + big * 0.62);
    ctx.globalAlpha = 1;
  }

  // ---------- the end of a run ----------
  function over() {
    state = "over";
    G.overT = 0;
    Sound.splash();
    buzz(30);
    burst(G.tw.x, G.S, "#e8f1ff", 22, 360, 6);
  }
  function finish() {
    state = "end";
    const isBest = G.score > G.best;
    if (isBest) store.set("best", G.score);
    const rec = {
      id: Date.now(),
      at: new Date().toISOString().slice(0, 16),
      score: G.score,
      best: isBest,
      seconds: Math.round(G.clock),
      climbed: Math.round(G.top / 10),
      ...G.stats,
      fps: G.perf.frames ? Math.round(G.perf.frames / G.perf.sum) : null,
      worstFrameMs: Math.round(G.perf.worst),
      screen: `${W}x${H}`,
    };
    runs.push(rec);
    if (runs.length > 80) runs = runs.slice(-80);
    store.set("runs", runs);
    window.__sl.last = rec;
    $("hud").hidden = true;
    buildEnd(rec, isBest);
    $("end").hidden = false;
    setTimeout(() => $("againBtn")?.focus({ preventScroll: true }), 30);
  }
  const el = (tag, cls, txt) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  };
  function starIcon(px) {
    const k = document.createElement("canvas");
    k.width = k.height = 7;
    k.getContext("2d").drawImage(starArt("lit"), 0, 0);
    k.style.width = k.style.height = px + "px";
    return k;
  }
  function buildEnd(rec, isBest) {
    const card = $("endCard");
    card.replaceChildren();
    card.append(el("h2", null, "The sea caught Twinkle"));
    const tot = el("div", "total");
    tot.append(starIcon(40), el("span", null, fmt(rec.score)));
    card.append(tot);
    const chips = el("div", "chips");
    if (isBest && G.best > 0) chips.append(el("span", "chip gold", `New best, +${fmt(rec.score - G.best)}`));
    else if (isBest) chips.append(el("span", "chip gold", "Your first best"));
    else chips.append(el("span", "chip", `Best ${fmt(G.best)}`));
    if (G.newFound.length === 1) chips.append(el("span", "chip gold", `New shape: ${G.newFound[0]}`));
    else if (G.newFound.length > 1) chips.append(el("span", "chip gold", `${G.newFound.length} new shapes`));
    card.append(chips);
    const m = Math.floor(rec.seconds / 60);
    const s = rec.seconds % 60;
    const facts = el("p", "facts");
    facts.append(
      el("b", null, `${rec.climbed} m`),
      document.createTextNode(" climbed · "),
      el("b", null, String(rec.shapes)),
      document.createTextNode(rec.shapes === 1 ? " shape · " : " shapes · "),
      el("b", null, m ? `${m} min ${s} s` : `${s} s`),
    );
    card.append(facts, el("p", "tiny", `Shapes found: ${found.size} of ${SHAPES.length}`));
    if (runs.length === 3 || runs.length === 8) card.append(noteBox(rec));
    const again = el("button", "btn", "Play again");
    again.id = "againBtn";
    again.onclick = play;
    card.append(again);
    const links = el("div", "links");
    const home = el("button", "link", "Home");
    home.onclick = goHome;
    const note = el("button", "link", "Leave a note");
    note.onclick = () => {
      if (!card.querySelector(".note")) card.insertBefore(noteBox(rec), again);
    };
    links.append(home, note);
    card.append(links);
  }
  function noteBox(rec) {
    const box = el("div", "note");
    box.append(el("b", null, "Did you want another go right away?"));
    const opts = el("div", "opts");
    const area = document.createElement("textarea");
    area.id = "note" + rec.id;
    area.rows = 2;
    area.placeholder = "What made you feel that? (optional)";
    const saved = el("span", "tiny");
    const save = () => {
      const r = runs.find((x) => x.id === rec.id);
      if (!r) return;
      r.wantedAnother = box.dataset.answer || null;
      r.note = area.value.trim().slice(0, 400) || null;
      store.set("runs", runs);
      saved.textContent = "Saved in this browser.";
    };
    for (const a of ["Yes, right away", "A little", "Not really"]) {
      const b = el("button", null, a);
      b.setAttribute("aria-pressed", "false");
      b.onclick = () => {
        box.dataset.answer = a;
        opts.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        save();
      };
      opts.append(b);
    }
    area.addEventListener("change", save);
    area.addEventListener("blur", save);
    box.append(opts, area, saved);
    return box;
  }

  // ---------- screens ----------
  function play() {
    Sound.unlock();
    newRun();
    state = "play";
    $("start").hidden = true;
    $("end").hidden = true;
    $("pause").hidden = true;
    $("notes").hidden = true;
    $("hud").hidden = false;
    $("scoreN").textContent = "0";
    $("best").textContent = G.best ? `Best ${fmt(G.best)}` : "";
  }
  function pause() {
    state = "pause";
    $("pause").hidden = false;
    $("resumeBtn").focus({ preventScroll: true });
  }
  function goHome() {
    state = "menu";
    G = null;
    $("end").hidden = true;
    $("hud").hidden = true;
    buildStart();
    $("start").hidden = false;
  }
  function buildStart() {
    $("hero").getContext("2d").clearRect(0, 0, 24, 24);
    $("hero").getContext("2d").drawImage(sprite("wave", 0), 0, 0);
    const best = store.get("best", 0);
    $("startBest").textContent = best ? `Your best: ${fmt(best)} stars · shapes found ${found.size} of ${SHAPES.length}` : "";
    $("soundBtn").textContent = Sound.on ? "Sound on" : "Sound off";
  }
  $("score").querySelector("canvas").getContext("2d").drawImage(starArt("lit"), 0, 0);
  $("playBtn").onclick = play;
  $("pauseBtn").onclick = pause;
  $("resumeBtn").onclick = () => {
    state = "play";
    $("pause").hidden = true;
  };
  $("restartBtn").onclick = play;
  $("soundBtn").onclick = () => {
    Sound.toggle();
    $("soundBtn").textContent = Sound.on ? "Sound on" : "Sound off";
  };
  const logText = () =>
    [
      `Starlight runs (${runs.length}), newest last. Shapes found ${found.size}/${SHAPES.length}.`,
      ...runs.map(
        (r) =>
          `${r.at} stars ${r.score}${r.best ? " (best)" : ""} ${r.seconds}s climbed ${r.climbed}m shapes ${r.shapes} broken ${r.broken} taps ${r.taps} too-far ${r.far} dark ${r.dark} catches ${r.catches} drops ${r.falls} fps ${r.fps} worst ${r.worstFrameMs}ms${r.wantedAnother ? ` | another go: ${r.wantedAnother}` : ""}${r.note ? ` | "${r.note}"` : ""}`,
      ),
    ].join("\n");
  $("notesBtn").onclick = () => {
    $("logBox").textContent = runs.length ? logText() : "No runs yet.";
    $("copyMsg").textContent = "";
    $("notes").hidden = false;
  };
  $("closeNotes").onclick = () => ($("notes").hidden = true);
  $("copyBtn").onclick = async () => {
    try {
      await navigator.clipboard.writeText(logText());
      $("copyMsg").textContent = "Copied.";
    } catch {
      const r = document.createRange();
      r.selectNodeContents($("logBox"));
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
      $("copyMsg").textContent = "Selected. Copy it with your device's copy.";
    }
  };

  // ---------- the loop ----------
  const STEP = 1 / 120;
  let acc = 0;
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.05, raw);
    if (G) G.vt += dt;
    if (state === "play") {
      if (G.started && raw < 1) {
        G.perf.frames++;
        G.perf.sum += raw;
        G.perf.worst = Math.max(G.perf.worst, raw * 1000);
        if (raw > 1 / 40) G.perf.slow++;
      }
      acc += dt * SPEED;
      while (acc >= STEP && state === "play") {
        acc -= STEP;
        if (BOT) bot();
        step(STEP);
      }
    } else acc = 0;
    if (G && (state === "play" || state === "over")) {
      const f = feet();
      // the view rides with the sea, so it's always there at the bottom; Twinkle climbs away from it or sinks toward it
      let want = G.S + 80 - VH;
      if (G.tw.y - want < VH * 0.3) want = G.tw.y - VH * 0.3;
      G.cy = lerp(G.cy, want, Math.min(1, dt * 4));
      G.cx = (FIELD - VW) / 2;
      for (const p of G.fx) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
      }
      G.fx = G.fx.filter((p) => p.life > 0);
      for (const t of G.texts) {
        t.life -= dt;
        t.y -= 40 * dt;
      }
      G.texts = G.texts.filter((t) => t.life > 0);
      for (const c of G.calls) c.life -= dt;
      G.calls = G.calls.filter((c) => c.life > 0);
      void f;
    }
    if (state === "over") {
      G.overT += dt;
      G.tw.y += 120 * dt;
      if (G.overT > (BOT ? 0.1 : 0.9)) finish();
    }
    render(dt);
  }
  window.__sl = {
    get state() {
      return state;
    },
    get G() {
      return G;
    },
    play,
    last: null,
  };
  buildStart();
  requestAnimationFrame(frame);
})();
