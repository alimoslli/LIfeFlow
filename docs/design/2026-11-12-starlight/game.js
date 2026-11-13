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
  const REACH = 300; // how close the sky keeps a way up (a strong flick goes much further)
  const STAND = 34; // Twinkle's middle above the star it stands on
  const U = 3.4; // world units per skyling pixel
  const STAR = 46; // a star's size
  const FLY_G = 1500; // gravity while flying
  const V_MIN = 420; // the softest flick
  const V_MAX = 1480; // the strongest flick: about five rows up
  const DRAG_MIN = 16; // screen px: shorter drags do nothing, so a touch never launches by accident
  const TOUCH = 50; // how close Twinkle must pass a star to light it
  const CATCH = 80; // falling past a star this close (side to side) catches Twinkle: a miss costs height, not the run
  // the sea waits for the first flick, then rises at once and speeds up steadily
  const seaBase = (t) => Math.min(420, 30 + 1.15 * t);
  const SEA_LEASH = 460; // the sea never trails further than this below you
  const SEA_CALM = 200; // how far a finished shape pushes the sea back
  // the sky changes as you climb: one new thing at a time, each told once when it comes into view
  const SWAY_FROM = 3000;
  const STORM_FROM = 7000;
  const TWINKLE_FROM = 12000;
  const SHOOT_FROM = 17000;
  const ZONES = [
    { h: SWAY_FROM, title: "The sky sways", sub: "Stars move now. Time your flick" },
    { h: STORM_FROM, title: "Storm clouds", sub: "They knock Twinkle back. Fly around them" },
    { h: TWINKLE_FROM, title: "Twinkling stars", sub: "Catch them while they glow" },
    { h: SHOOT_FROM, title: "Shooting stars", sub: "Catch one for a big bonus" },
    { h: 23000, title: "Higher still", sub: "Everything a little faster" },
  ];
  const LAST_CHANCE = 0.9; // seconds to flick away once the sea reaches Twinkle's star

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
      bonk: () => tone(240, 0.09, { type: "triangle", vol: 0.1, slide: 0.7 }),
      land: () => tone(180, 0.12, { vol: 0.12, slide: 1.6 }),
      combo: (n) =>
        [0, 4, 7, 12].slice(0, Math.min(4, n - 1)).forEach((s, i) => tone(523.25 * 2 ** (s / 12), 0.4, { type: "triangle", vol: 0.1, at: 0.05 + i * 0.07 })),
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
      tw: { x: FIELD / 2, y: -200 - STAND, on: null, fly: null },
      air: 1,
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
      cy: -200 - VH * 0.6,
      stats: { flicks: 0, airFlicks: 0, bestFlick: 0, oneFlickShapes: 0, bounces: 0, lit: 0, shapes: 0, broken: 0, close: 0, zaps: 0, shooting: 0, stuck: 0 },
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
    const hard = clamp((h - 400) / 24000, 0, 1);
    G.genY -= lerp(100, 150, hard) * (0.85 + R() * 0.3);
    const n = 1 + (R() < 0.7 - hard * 0.3 ? 1 : 0);
    // a swaying row: every star in it moves together, side to side
    const sh = clamp((h - SWAY_FROM) / 20000, 0, 1);
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
    const tw = h > TWINKLE_FROM ? lerp(0.25, 0.5, clamp((h - TWINKLE_FROM) / 14000, 0, 1)) : 0;
    const row = xs.map((x) => {
      const o = { twinkle: R() < tw, bx: x };
      if (sway) Object.assign(o, { amp: sway.amp, w: sway.w, phi: sway.phi });
      const st = addStar(x, G.genY + (R() - 0.5) * 30, o);
      moveStar(st);
      return st;
    });
    cover(G.prevRow, row);
    if (h < TWINKLE_FROM + 6000 && row.every((s) => s.twinkle)) row[0].twinkle = false;
    // a storm cloud sits in the row, level with where Twinkle stands, and blocks the zips that cross it; it never
    // closes the way up, and never drifts onto a star
    if (h > STORM_FROM && R() < lerp(0.45, 0.7, clamp((h - STORM_FROM) / 18000, 0, 1))) {
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

  // a twinkling star only counts while it glows (the one Twinkle stands on stays lit)
  const phaseAt = (s, t) => (((t * 0.55 + s.ph) % 1) + 1) % 1;
  const glowingAt = (s, t) => !s.twinkle || s === G.tw.on || phaseAt(s, t) < 0.65;
  const glowing = (s) => glowingAt(s, G.clock);
  const fading = (s) => s.twinkle && s !== G.tw.on && phaseAt(s, G.clock) > 0.53 && phaseAt(s, G.clock) < 0.65;
  const feet = () => ({ x: G.tw.x, y: G.tw.y + STAND });
  const inside = (sm, x, y) => ((x - sm.x) / (sm.rx + 6)) ** 2 + ((y - sm.y) / (sm.ry + 12)) ** 2 < 1;

  // ---------- the move: drag anywhere, let go, and Twinkle flies the other way ----------
  function flickVelocity(dx, dy) {
    const len = Math.hypot(dx, dy) || 1;
    const p = clamp(len / clamp(Math.min(W, H) * 0.34, 110, 220), 0, 1);
    const v = lerp(V_MIN, V_MAX, p);
    return { vx: (-dx / len) * v, vy: (-dy / len) * v, p };
  }
  const canFlick = () => state === "play" && (!!G.tw.on || (!!G.tw.fly && G.air > 0));
  function launch(vx, vy) {
    const tw = G.tw;
    const air = !tw.on;
    if (air) {
      G.air--;
      G.stats.airFlicks++;
      tw.fly.from = null;
    } else {
      G.air = 1;
      tw.fly = { from: tw.on, t: 0, lit: [], zapped: null, bounces: 0 };
    }
    tw.fly.vx = vx;
    tw.fly.vy = vy;
    tw.fly.t = 0;
    tw.on = null;
    if (G.wet != null) {
      G.wet = null;
      G.stats.close++;
      text(tw.x, tw.y - 60, "Close one!", "#86d3a0", 26);
    }
    G.stats.flicks++;
    G.squash = 0;
    Sound.zip();
    if (!G.started) G.started = true;
  }
  function flyStep(dt) {
    const tw = G.tw;
    const f = tw.fly;
    f.t += dt;
    f.vy += FLY_G * dt;
    const y0 = tw.y;
    tw.x += f.vx * dt;
    tw.y += f.vy * dt;
    G.trailT = (G.trailT || 0) + dt;
    if (G.trailT > 0.016) {
      G.trailT = 0;
      G.trail.push({ x: tw.x, y: tw.y, life: 0.3 });
    }
    // the sides bounce: bank shots
    if (tw.x < 26 || tw.x > FIELD - 26) {
      tw.x = clamp(tw.x, 26, FIELD - 26);
      f.vx = -f.vx * 0.72;
      f.bounces++;
      G.stats.bounces++;
      Sound.bonk();
      if (f.bounces === 1) text(tw.x < FIELD / 2 ? tw.x + 70 : tw.x - 70, tw.y, "Bank!", "#d8e6ff", 22);
    }
    // a storm knocks Twinkle back down
    for (const sm of G.storms)
      if (sm !== f.zapped && inside(sm, tw.x, tw.y)) {
        f.zapped = sm;
        f.vx *= -0.35;
        f.vy = Math.max(f.vy, 300);
        G.stats.zaps++;
        text(tw.x, tw.y - 50, "Zap!", "#ffc1b4", 28);
        burst(tw.x, tw.y, "#d8e6ff", 10, 260, 5);
        Sound.no();
        buzz(25);
      }
    // stars: everything Twinkle passes lights up; on the way down, the first star it drops past catches it
    let catchStar = null;
    for (const s of G.stars) {
      if (s.out || !glowing(s) || (s === f.from && f.t < 0.25)) continue;
      const stand = s.y - STAND;
      if (f.vy > 0 && y0 <= stand && tw.y >= stand && Math.abs(s.x - tw.x) < CATCH && (!catchStar || stand < catchStar.y - STAND)) catchStar = s;
      if (Math.abs(s.x - tw.x) > TOUCH || Math.abs(s.y - tw.y) > TOUCH) continue;
      if (Math.hypot(s.x - tw.x, s.y - tw.y) > TOUCH) continue;
      if (!s.lit || s.shooting) lightInFlight(s);
    }
    if (catchStar) return catchOn(catchStar);
    // the sea
    if (tw.y > G.S - 12) over();
  }
  function lightInFlight(s) {
    const f = G.tw.fly;
    if (s.shooting) {
      s.shooting = false;
      s.vx = 0;
      s.bx = s.x;
      s.amp = 0;
      G.stats.shooting++;
      G.score += 10;
      G.seaDrop += 260;
      call("Shooting star!", "+10 stars · the sea calms", "#ffdc6e");
      Sound.best();
    }
    if (s.lit) return;
    s.lit = true;
    s.litT = G.clock;
    G.stats.lit++;
    f.lit.push(s);
    // each star in one flick is worth more than the last: 1, 2, 3, 4...
    const k = f.lit.length;
    G.score += k;
    bumpScore();
    text(s.x, s.y - 34, `+${k}`, k >= 3 ? "#ffdc6e" : "#ffffff", 18 + Math.min(k, 6) * 2);
    Sound.star(Math.min(3 + k, 14));
    burst(s.x, s.y, "#ffdc6e", 10, 230, 5);
    buzz(5);
    const c = s.shape;
    if (c && !c.done && !c.broken && c.stars.every((x) => x.lit)) {
      c.done = true;
      G.stats.shapes++;
      const one = c.stars.every((x) => f.lit.includes(x));
      const n = c.stars.length * (one ? 4 : 2);
      G.score += n;
      bumpScore();
      G.seaDrop += SEA_CALM * (one ? 1.5 : 1);
      if (one) G.stats.oneFlickShapes++;
      if (!found.has(c.name)) {
        found.add(c.name);
        G.newFound.push(c.name);
        store.set("found", [...found]);
      }
      call(c.name, one ? `In one flick! +${n} stars · the sea calms` : `+${n} stars · the sea calms`, "#ffdc6e");
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
  const FLICK_WORDS = ["", "", "", "Nice!", "Lovely!", "Brilliant!", "Dazzling!", "Starburst!"];
  function catchOn(s) {
    const tw = G.tw;
    const f = tw.fly;
    if (!s.lit || s.shooting) lightInFlight(s);
    tw.on = s;
    tw.fly = null;
    tw.x = s.x;
    tw.y = s.y - STAND;
    G.air = 1;
    G.squash = 1;
    Sound.land();
    burst(s.x, s.y, "#cfe0ff", 5, 140, 4);
    const n = f.lit.length;
    G.stats.bestFlick = Math.max(G.stats.bestFlick, n);
    if (n >= 3) {
      call(FLICK_WORDS[Math.min(n, 7)], `${n} stars in one flick`, "#ffdc6e");
      Sound.combo(n);
    }
    G.top = Math.max(G.top, -s.y);
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
      addStar(dir > 0 ? -60 : FIELD + 60, tw.y - 160 - G.R() * 220, { vx: dir * (240 + G.R() * 110), shooting: true });
      G.shootNext = G.clock + 8 + G.R() * 6;
    }
    if (tw.on) {
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
    if (tw.fly) {
      flyStep(dt);
      if (state !== "play") return;
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
    // the sea reaches the star Twinkle stands on: a last moment to flick away
    if (tw.on && G.wet == null && tw.y + STAND * 0.6 > G.S) {
      G.wet = LAST_CHANCE;
      text(tw.x, tw.y - 64, "Flick!", "#ffc1b4", 32);
      Sound.warn();
      buzz(20);
    }
    if (G.wet != null && tw.on) {
      G.wet -= dt;
      if (G.wet <= 0) return over();
    }
    // hints, once per device
    hint("flick", true);
    if (G.started) {
      const vis = (s) => s.y > G.cy + 120 / SC && s.y < G.cy + VH - 60;
      const sh = G.shapes.find((c) => !c.done && !c.broken && c.stars.every(vis));
      if (sh) hint("shape", sh);
      if (G.clock > 3 && tw.on) hint("sea", true);
      if (tw.fly && tw.fly.vy > 300 && G.air > 0 && tw.fly.from && tw.y > tw.fly.from.y - STAND + 80) hint("air", true);
    }
    // the hum quickens as the sea gets close
    G.warnT -= dt;
    const gapNow = G.S - feet().y;
    if (G.started && gapNow < 240 && G.warnT <= 0) {
      Sound.warn();
      G.warnT = 0.3 + 0.7 * clamp(gapNow / 240, 0, 1);
    }
    // the bot's fairness report: standing with no flick that lands at least as high, for 3 seconds
    if (BOT && tw.on) {
      G.stuckCheckT = (G.stuckCheckT || 0) + dt;
      if (G.stuckCheckT > 0.5) {
        G.stuckCheckT = 0;
        const p = botPlan(false);
        G.stuckT = p && p.gain > -20 ? 0 : G.stuckT + 0.5;
        if (G.stuckT >= 3) {
          G.stats.stuck++;
          G.stuckT = -99;
        }
      }
    }
    gen(G.cy - 700);
    if (G.stars.length > 420) G.stars = G.stars.filter((s) => s.y < G.S + 300 || s.shape);
  }

  function hint(id, what) {
    if (seen.has(id) || G.hints.some((h) => h.id === id)) return;
    if (id === "flick" && G.started) return;
    // one at a time, never over a big moment
    if (id !== "flick" && (G.hints.length || G.calls.length)) return;
    G.hints.push({ id, what, life: id === "flick" ? 999 : 3.2 });
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
  function bumpScore() {
    $("scoreN").textContent = fmt(G.score);
    if (RM) return;
    const el = $("score");
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }

  // ---------- input: one drag per move ----------
  let drag = null;
  cv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state !== "play" || drag) return;
    Sound.unlock();
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {}
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
  });
  cv.addEventListener("pointermove", (e) => {
    if (drag && e.pointerId === drag.id) {
      drag.x = e.clientX;
      drag.y = e.clientY;
    }
  });
  cv.addEventListener("pointerup", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = drag.x - drag.x0;
    const dy = drag.y - drag.y0;
    drag = null;
    if (Math.hypot(dx, dy) < DRAG_MIN || !canFlick()) return;
    const v = flickVelocity(dx, dy);
    launch(v.vx, v.vy);
  });
  cv.addEventListener("pointercancel", (e) => {
    if (drag && e.pointerId === drag.id) drag = null;
  });
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && state === "end") {
      e.preventDefault();
      play();
    }
    if (e.code === "Escape" && state === "play") pause();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "play") pause();
  });

  // ---------- the bot (?bot=1 plays well, ?bot=human like a first-timer): it aims by trying flicks in its head ----------
  function simulate(vx, vy, maxT = 2.6) {
    const tw = G.tw;
    const from = tw.on || (tw.fly && tw.fly.from);
    let x = tw.x;
    let y = tw.y;
    let lit = 0;
    let shape = 0;
    const near = G.stars.filter((s) => !s.out && Math.abs(s.y - y) < 1000);
    const dt = 1 / 60;
    const hit = new Set();
    for (let t = 0; t < maxT; t += dt) {
      vy += FLY_G * dt;
      const y0 = y;
      x += vx * dt;
      y += vy * dt;
      if (x < 26 || x > FIELD - 26) {
        x = clamp(x, 26, FIELD - 26);
        vx = -vx * 0.72;
      }
      if (G.storms.some((sm) => inside(sm, x, y))) return null;
      if (y > G.S - 40) return null;
      for (const s of near) {
        if ((s === from && t < 0.25) || !glowingAt(s, G.clock + t)) continue;
        const stand = s.y - STAND;
        if (vy > 0 && y0 <= stand && y >= stand && Math.abs(s.x - x) < CATCH * 0.85)
          return { star: s, lit: lit + (s.lit ? 0 : 1), shape, gain: tw.y + STAND - s.y, t };
        if (Math.hypot(s.x - x, s.y - y) > TOUCH * 0.8) continue;
        if (!s.lit && !hit.has(s)) {
          hit.add(s);
          lit++;
          if (s.shape && !s.shape.done) shape++;
        }
      }
    }
    return null;
  }
  function botPlan(human) {
    let best = null;
    for (let a = -175; a <= -5; a += 7)
      for (let p = 0.25; p <= 1.001; p += 0.125) {
        const ang = (a * Math.PI) / 180;
        const v = lerp(V_MIN, V_MAX, p);
        const r = simulate(Math.cos(ang) * v, Math.sin(ang) * v);
        if (!r) continue;
        const gap = G.S - feet().y;
        const score = r.gain * (gap < 260 ? 2 : 1) + r.lit * 70 + r.shape * 60 + (r.star.shooting ? 400 : 0) - (human ? 0 : r.t * 30);
        if (!best || score > best.score) best = { ...r, score, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v };
      }
    return best;
  }
  const HUMAN = Q.get("bot") === "human";
  function bot() {
    G.botT -= 1 / 120;
    if (G.botT > 0) return;
    const tw = G.tw;
    if (tw.on) {
      G.botT = HUMAN ? 0.9 + Math.random() * 0.8 : 0.35 + Math.random() * 0.3;
      const plan = botPlan(HUMAN);
      if (plan) {
        // a first-timer's aim is a little off
        const n = HUMAN ? 1 + (Math.random() - 0.5) * 0.22 : 1;
        const turn = HUMAN ? (Math.random() - 0.5) * 0.12 : 0;
        const c = Math.cos(turn);
        const sn = Math.sin(turn);
        launch((plan.vx * c - plan.vy * sn) * n, (plan.vx * sn + plan.vy * c) * n);
      }
    } else if (tw.fly && G.air > 0 && tw.fly.vy > 200 && tw.fly.t > 0.4) {
      G.botT = 0.15;
      const r = simulate(tw.fly.vx, tw.fly.vy);
      if (!r || r.gain < -150) {
        const plan = botPlan(HUMAN);
        if (plan) launch(plan.vx, plan.vy);
      }
    }
    if (BOT && G.clock > (Number(Q.get("cap")) || 1e9)) G.S = G.tw.y - 300;
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
    // aiming: the pull behind Twinkle, and the start of the arc ahead (longer for your first runs)
    if (state === "play" && drag && canFlick() && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) >= DRAG_MIN) {
      const v = flickVelocity(drag.x - drag.x0, drag.y - drag.y0);
      const sp = Math.hypot(v.vx, v.vy);
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(tw.x, tw.y);
      ctx.lineTo(tw.x - (v.vx / sp) * (30 + 70 * v.p), tw.y - (v.vy / sp) * (30 + 70 * v.p));
      ctx.stroke();
      const aimT = runs.length < 2 ? 0.6 : runs.length < 5 ? 0.42 : 0.3;
      let x = tw.x;
      let y = tw.y;
      let vx = v.vx;
      let vy = v.vy;
      for (let i = 1; i <= 24; i++) {
        const dt = aimT / 24;
        vy += FLY_G * dt;
        x += vx * dt;
        y += vy * dt;
        if (x < 26 || x > FIELD - 26) {
          x = clamp(x, 26, FIELD - 26);
          vx = -vx * 0.72;
        }
        if (i % 2) continue;
        ctx.globalAlpha = 0.9 - i / 30;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
      ctx.globalAlpha = 1;
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
      const lightOn = glowing(s);
      let look;
      if (s.shooting) look = "lit";
      else if (s.out) look = "out";
      else if (s.twinkle && !lightOn) look = "dark";
      else if (s.lit) look = "lit";
      else if (s.twinkle) look = "glow";
      else look = "near";
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
      const aiming = drag && tw.on && Math.hypot(drag.x - drag.x0, drag.y - drag.y0) >= DRAG_MIN;
      if (tw.fly) {
        pose = tw.fly.vy < 0 ? "celebrate" : g.S - f.y < 200 ? "surprised" : "celebrate";
        fr = tw.fly.vy < 0 ? 2 : 1;
      } else if (aiming) {
        pose = "stretch";
        fr = 0;
        const v = flickVelocity(drag.x - drag.x0, drag.y - drag.y0);
        g.squash = Math.max(g.squash, v.p * 0.8);
      } else if (g.wet != null || g.S - f.y < 200) {
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
      const lean = tw.fly ? clamp(tw.fly.vx / 1600, -0.5, 0.5) : 0;
      ctx.save();
      ctx.translate(tw.x, tw.y);
      ctx.rotate(lean);
      ctx.scale(sx, sy);
      if (state === "over") ctx.globalAlpha = clamp(1 - g.overT * 1.6, 0, 1);
      ctx.drawImage(img, -12 * U, -14 * U + (1 - sy) * 30, s, s);
      ctx.restore();
      // the mid-air flick that's still there: a little spark circling Twinkle
      if (tw.fly && g.air > 0) {
        const a = vt * 8;
        ctx.fillStyle = "#fff3c4";
        ctx.fillRect(tw.x + Math.cos(a) * 46 - 4, tw.y + Math.sin(a) * 46 - 4, 8, 8);
      }
    }
    // hints
    for (const hn of g.hints) {
      if (state === "play" && hn.id !== "flick") hn.life -= 1 / 60;
      let x;
      let y;
      let label;
      if (hn.id === "flick") {
        // a ghost of the move: a finger pulls down, the arc shows where Twinkle would go
        const k = (vt % 2.2) / 2.2;
        const pull = Math.min(1, k * 2.2);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(tw.x, tw.y + 50);
        ctx.lineTo(tw.x + 40 * pull, tw.y + 50 + 110 * pull);
        ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(tw.x + 40 * pull, tw.y + 50 + 110 * pull, 14, 0, TAU);
        ctx.fill();
        for (let i = 1; i <= 8; i++) {
          const t = i * 0.05 * pull;
          ctx.globalAlpha = 0.8 - i * 0.08;
          ctx.fillRect(tw.x - 330 * t * 0.35 - 4, tw.y - 1150 * t + 0.5 * FLY_G * t * t - 4, 8, 8);
        }
        ctx.globalAlpha = 1;
        x = tw.x;
        y = tw.y - 110;
        label = "Drag back, let go";
      } else if (hn.id === "air") {
        x = f.x;
        y = f.y - 110;
        label = "Flick again in mid-air!";
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
        label = "The sea is rising. Keep climbing";
      }
      ctx.font = `800 26px Geist, ui-sans-serif, system-ui, sans-serif`;
      const half = ctx.measureText(label).width / 2 + 12;
      x = clamp(x, g.cx + half, g.cx + VW - half);
      ctx.globalAlpha = clamp(hn.life, 0, 1);
      label3d(label, x, y, "#ffffff", 26);
      ctx.globalAlpha = 1;
    }
    g.hints = g.hints.filter((hn) => hn.life > 0 && !(hn.id === "flick" && g.started));
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
      document.createTextNode(" · best flick "),
      el("b", null, `${rec.bestFlick} stars`),
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
          `${r.at} stars ${r.score}${r.best ? " (best)" : ""} ${r.seconds}s climbed ${r.climbed}m flicks ${r.flicks} air ${r.airFlicks} best-flick ${r.bestFlick} shapes ${r.shapes} one-flick-shapes ${r.oneFlickShapes} bank ${r.bounces} zaps ${r.zaps} shooting ${r.shooting} saves ${r.close} fps ${r.fps} worst ${r.worstFrameMs}ms${r.wantedAnother ? ` | another go: ${r.wantedAnother}` : ""}${r.note ? ` | "${r.note}"` : ""}`,
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
      // standing: Twinkle a little below the middle, so the sky it can reach is in view; flying: the view only rises
      // to keep Twinkle on screen, and follows a fall down
      const tw = G.tw;
      if (G.camWant == null) G.camWant = tw.y - VH * 0.58;
      if (tw.fly) {
        G.camWant = Math.min(G.camWant, tw.y - VH * 0.32);
        if (tw.y > G.camWant + VH * 0.82) G.camWant = tw.y - VH * 0.82;
      } else G.camWant = tw.y - VH * 0.58;
      const want = G.camWant;
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
