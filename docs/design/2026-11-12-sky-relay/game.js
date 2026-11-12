/* Sky Relay (prototype, 2026-11-12). One day, five skylings, one input. See README.md for the rules and what "done" means.
   The skylings, the cloud, the star and Puff are drawn by the app's own code (window.Skylings, bundled by build.mjs). */
(() => {
  "use strict";
  const SK = window.Skylings;
  const BY = Object.fromEntries(SK.COMPANIONS.map((c) => [c.key, c]));
  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const BOT = Q.has("bot");
  const SPEED = Math.max(1, Math.min(20, Number(Q.get("speed")) || 1));
  const DEBUG = Q.has("debug");
  const RM = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const TAU = Math.PI * 2;

  // ---------- local storage (this browser only; every access may fail) ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("skyrelay." + k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("skyrelay." + k, JSON.stringify(v));
      } catch {}
    },
  };

  // ---------- seeded randomness ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  // ---------- the day, the cast, today's twist ----------
  const LEG_T = 18;
  const DAY_T = LEG_T * 5;
  const CAST = [
    { key: "dawn", name: "Dawn", move: "Float", hint: "Hold to rise, let go to sink", trail: "#ffc9b8", target: 1500 },
    { key: "ray", name: "Ray", move: "Swing", hint: "Hold to catch a star, let go to fly", trail: "#ffdc6e", target: 9000 },
    { key: "goldie", name: "Goldie", move: "Bounce", hint: "Hold to dive. Pop clouds, clear storms from above", trail: "#ffad5a", target: 4000 },
    { key: "star", name: "Twinkle", move: "Light", hint: "Tap stars to zip to them. Light whole shapes", trail: "#cfe0ff", target: 6000 },
    { key: "moon", name: "Dreamy", move: "Glide", hint: "Hold to climb, let go to swoop. Skim the sea, skip off it", trail: "#eef3ff", target: 2500 },
  ];
  const MODS = [
    { id: "clear", name: "Clear", line: "A calm sky." },
    { id: "windy", name: "Windy", line: "A tailwind all day: faster and farther." },
    { id: "stormy", name: "Stormy", line: "More storms, and clearing one is worth more." },
    { id: "shower", name: "Star shower", line: "Extra sparks everywhere." },
    { id: "bigstars", name: "Long reach", line: "Stars can be caught from farther away." },
  ];
  const todayMod = () => MODS[hash("mod" + todayStr()) % MODS.length];
  const WORDS = ["", "", "Nice", "Lovely", "Bright!", "Brilliant!", "Dazzling!", "Radiant!", "Sky high!", "Stellar!", "Sunburst!"];

  // the sky through one day (lib/sky.ts stops: first light to night; blues and warm light only)
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const SKY = [
    [0.0, "#182b55", "#2b4677", "#4a6699"],
    [0.07, "#13284f", "#3f5d8c", "#d98a62"],
    [0.15, "#2e5791", "#7d9cc7", "#ffb27a"],
    [0.23, "#3f7fc8", "#9dc3e8", "#f8dcbc"],
    [0.31, "#2f7cd2", "#76b1e8", "#cfe6f8"],
    [0.4, "#2a76d0", "#6aaae6", "#c8e3f8"],
    [0.47, "#3479c9", "#7fb2e2", "#d6e7f3"],
    [0.55, "#4a7fbf", "#a6bfd8", "#ffd391"],
    [0.62, "#36578f", "#c98f78", "#ff8a45"],
    [0.68, "#1b3263", "#6a5a7a", "#e2643f"],
    [0.75, "#1a2d5a", "#344c7c", "#5a6588"],
    [0.82, "#142451", "#233c6e", "#3a5a8f"],
    [1.0, "#142451", "#233c6e", "#3a5a8f"],
  ].map(([p, a, b, c]) => [p, hex(a), hex(b), hex(c)]);
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const css = (c, al = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${al})`;
  function skyAt(p) {
    for (let i = 1; i < SKY.length; i++)
      if (p <= SKY[i][0]) {
        const [pa, ...A] = SKY[i - 1];
        const [pb, ...B] = SKY[i];
        const t = (p - pa) / (pb - pa || 1);
        return [mixc(A[0], B[0], t), mixc(A[1], B[1], t), mixc(A[2], B[2], t)];
      }
    return SKY[SKY.length - 1].slice(1);
  }

  // ---------- pictures (pixel art cached on little canvases) ----------
  const cache = new Map();
  function sprite(key, pose, frame, night) {
    const n = SK.FRAMES[pose].length;
    const f = ((frame % n) + n) % n;
    const id = `${key}|${pose}|${f}|${night ? 1 : 0}`;
    let cv = cache.get(id);
    if (cv) return cv;
    cv = document.createElement("canvas");
    cv.width = cv.height = 24;
    const g = cv.getContext("2d");
    const px = SK.pixels(BY[key], pose, f, night).filter(([, y]) => y < 23);
    if (night && key === "star") {
      // Twinkle is the night's own colour: a pale moonlit rim keeps it visible (as drawCompanion does)
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
  const CLOUD_PAL = [
    { X: "#fff0ea", S: "#e7b4a4" }, // dawn
    { X: "#ffffff", S: "#a9b9d3" }, // day
    { X: "#fff3dc", S: "#e6b783" }, // golden hour
    { X: "#f2e2d6", S: "#9aa6c2" }, // evening
    { X: "#cfdaee", S: "#7f93b8" }, // night
  ];
  const STORM_PAL = { X: "#6f7d98", S: "#46526b" };
  const cloudArt = (w, leg) => art(`cloud${w}|${leg}`, SK.cloud(w), CLOUD_PAL[leg]);
  const stormArt = (w) => art(`storm${w}`, SK.cloud(w), STORM_PAL);
  const starArt = (state) =>
    art(
      "star" + state,
      SK.STAR_ICON,
      state === "lit" ? { k: "#5a3d10", y: "#ffdc6e" } : state === "gold" ? { k: "#7a4a12", y: "#ffb43c" } : { k: "#4d5f80", y: "#e3ebf7" },
    );
  const puffArt = () => art("puff", SK.ART.puff, {});
  const sunArt = () => art("sun", SK.SUN_ICON, {});
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

  // ---------- sound: made in code, off with the toggle ----------
  const Sound = (() => {
    let ac = null;
    let out = null;
    let on = store.get("sound", true);
    let noiseBuf = null;
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
      f.Q.value = o.q || 0.9;
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
    const note = (i) => 523.25 * 2 ** ((12 * Math.floor(i / 5) + PENT[((i % 5) + 5) % 5]) / 12);
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
      spark: (i) => tone(note(Math.min(i, 14)), 0.11, { type: "triangle", vol: 0.09 }),
      star: (i) => {
        tone(note(i), 0.55, { vol: 0.2 });
        tone(note(i) * 2, 0.22, { vol: 0.05 });
      },
      grab: () => tone(260, 0.09, { type: "triangle", vol: 0.12, slide: 1.6 }),
      whoosh: () => noise(0.22, { vol: 0.08, freq: 700, sweep: 3 }),
      perfect: () => {
        tone(1318.5, 0.16, { type: "triangle", vol: 0.12 });
        tone(1975.5, 0.32, { type: "triangle", vol: 0.1, at: 0.06 });
      },
      pop: () => {
        noise(0.07, { vol: 0.2, freq: 2400 });
        tone(700, 0.12, { vol: 0.13, slide: 0.45 });
      },
      bounce: () => tone(190, 0.16, { vol: 0.15, slide: 2.2 }),
      clear: () => {
        [0, 4, 7, 12].forEach((s, i) => tone(523.25 * 2 ** (s / 12), 0.5, { type: "triangle", vol: 0.1, at: i * 0.05 }));
        noise(0.3, { vol: 0.08, freq: 3200 });
      },
      zap: () => {
        tone(120, 0.24, { type: "sawtooth", vol: 0.09, slide: 0.6 });
        noise(0.16, { vol: 0.12, freq: 500 });
      },
      splash: () => noise(0.55, { vol: 0.25, freq: 900, type: "lowpass", sweep: 0.3 }),
      relay: () => [0, 7, 12].forEach((s, i) => tone(659.25 * 2 ** (s / 12), 0.26, { type: "triangle", vol: 0.12, at: i * 0.07 })),
      level: (m) => {
        tone(note(4 + m), 0.26, { type: "triangle", vol: 0.12 });
        tone(note(6 + m), 0.38, { type: "triangle", vol: 0.09, at: 0.06 });
      },
      best: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(523.25 * 2 ** (s / 12), 0.42, { type: "triangle", vol: 0.11, at: i * 0.08 })),
      night: () => [0, 7, 16].forEach((s, i) => tone(261.63 * 2 ** (s / 12), 2.4, { vol: 0.07, attack: 0.5, at: i * 0.18 })),
      puff: () => tone(380, 0.28, { vol: 0.13, slide: 2.1 }),
      lose: () => tone(392, 0.22, { type: "triangle", vol: 0.07, slide: 0.75 }),
      phrase: (notes) => notes.forEach((n, i) => tone(note(n), 0.4, { vol: 0.12, at: i * 0.08 })),
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
    SC = Math.min(W / 620, H / 1000);
    VW = W / SC;
    VH = H / SC;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- the round ----------
  const U = 3.2; // world units per skyling pixel
  const FEET = 30; // from the body's middle to the boots
  const SEA = 0;
  const TOP = -760;
  let state = "menu"; // menu | play | pause | end
  let G = null;
  let held = false;
  let rounds = store.get("rounds", []);
  const unlocked = new Set(store.get("trails", []));
  const found = new Set(store.get("found", []));

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
        [0.5, 0.62],
      ],
      edges: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 0],
        [4, 5],
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
        [0.9, 0.3],
        [0.62, 0.66],
        [0.38, 0.66],
        [0.1, 0.3],
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

  function newGame(mode) {
    const seedStr = mode === "today" ? todayStr() : String((Math.random() * 1e9) | 0);
    const mod = mode === "today" ? todayMod() : MODS[(Math.random() * MODS.length) | 0];
    const bestKey = mode === "today" ? "best.today." + seedStr : "best.any";
    G = {
      mode,
      seedStr,
      seed: hash(seedStr),
      mod,
      bestKey,
      best: store.get(bestKey, null),
      allBest: store.get("best.all", 0),
      t: 0,
      vt: 0,
      leg: -1,
      legT0: 0,
      legX0: 0,
      p: { x: 0, y: -330, vx: 340, vy: 0 },
      rope: null,
      zip: null,
      tap: null,
      glide: { a: 0, s: 700 },
      rescue: 0,
      inv: 0,
      slow: 0,
      shake: 0,
      squash: 0,
      lastPerfect: false,
      perfectNow: false,
      score: 0,
      chain: 0,
      mult: 1,
      longest: 0,
      legScores: [0, 0, 0, 0, 0],
      legFalls: [0, 0, 0, 0, 0],
      stats: { lit: 0, perfects: 0, storms: 0, pops: 0, consts: 0, falls: 0, zaps: 0, lines: 0, skims: 0, presses: 0, whiffs: 0 },
      stars: [],
      clouds: [],
      storms: [],
      sparks: [],
      groups: [],
      consts: [],
      fx: [],
      texts: [],
      calls: [],
      litLog: [],
      constLog: [],
      newFound: [],
      rec: [[], [], [], [], []],
      timeline: [],
      recT: 0,
      tlT: 0,
      sparkStreak: 0,
      sparkT: 0,
      skimT: 0,
      skimN: 0,
      passedBest: false,
      camX: -VW * 0.3,
      old: null,
      perf: { frames: 0, sum: 0, worst: 0, slow: 0 },
      trailT: 0,
    };
    G.ghost = mode === "today" ? store.get("ghost." + seedStr, null) : null;
    startLeg(0);
    const from = Number(Q.get("leg"));
    if (from > 0 && from < 5) G.t = from * LEG_T - 0.001;
  }

  // what each thing is worth before the multiplier (tuned so no leg dwarfs the others)
  const PTS = {
    spark: 10,
    linePer: 15,
    dew: 50,
    star: 40,
    gold: 120,
    perfect: 30,
    again: 5,
    bounce: 5,
    pop: 50,
    storm: 180,
    stormy: 260,
    shapePer: 100,
    skim: 12,
    skip: 40,
    relay: 200,
  };
  const mult = (c) => Math.min(10, 1 + Math.floor(c / 8));
  function act(points, chainAdd, x, y, label, color) {
    G.chain += chainAdd;
    G.longest = Math.max(G.longest, G.chain);
    const m = mult(G.chain);
    if (m > G.mult) {
      G.mult = m;
      if (WORDS[m]) call(WORDS[m], `×${m}`, "#ffdc6e", 0.62);
      Sound.level(m);
      const el = $("mult");
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
    }
    const pts = Math.round(points * G.mult);
    G.score += pts;
    G.legScores[G.leg] += pts;
    if (x != null) text(x, y, label ? `${label} +${fmt(pts)}` : `+${fmt(pts)}`, color || "#ffffff", label ? 30 : 24);
    const best = G.best?.score || 0;
    if (!G.passedBest && best > 0 && G.score > best) {
      G.passedBest = true;
      call("New best!", "You just passed it", "#86d3a0");
      Sound.best();
    }
  }
  function breakChain(why) {
    if (G.chain >= 8) {
      call(why, `Chain of ${G.chain} ended`, "#ffc1b4");
      Sound.lose();
    }
    G.chain = 0;
    G.mult = 1;
  }

  // ---------- making each leg's sky (seeded, laid out from where the leg starts) ----------
  function addStar(x, y, kind = "star", extra = {}) {
    const s = { x, y, kind, lit: false, leg: G.leg, ph: Math.random(), born: G.t, ...extra };
    G.stars.push(s);
    return s;
  }
  function addCloud(x, y, w) {
    G.clouds.push({ x, y, w, hw: (w * 4) / 2, leg: G.leg, squish: 0, born: G.t });
  }
  function addStorm(x, y, w) {
    G.storms.push({ x, y, w, rx: (w * 5) / 2, ry: 24, leg: G.leg, dead: false, born: G.t, ph: Math.random() * 10 });
  }
  function addSparks(pts) {
    const g = { n: pts.length, got: 0, missed: false, done: false };
    G.groups.push(g);
    const gi = G.groups.length - 1;
    for (const [x, y] of pts) G.sparks.push({ x, y: clamp(y, TOP + 20, -40), g: gi, got: false, born: G.t });
  }
  const sparkGap = () => (G.mod.id === "shower" ? 0.7 : 1);

  const GEN = [
    function dawn(x0, R) {
      let x = x0;
      const end = x0 + 7600;
      while (x < end) {
        const prog = (x - x0) / 7600;
        const n = 7 + ((R() * 5) | 0);
        const step = (46 + R() * 10) * sparkGap();
        const wl = 520 + R() * 320;
        const amp = Math.min(0.2 * wl, 60 + R() * (80 + 120 * prog));
        const cy = clamp(-230 - R() * 360, TOP + amp + 30, -90 - amp);
        const type = R();
        const dir = R() < 0.5 ? 1 : -1;
        const pts = [];
        const count = Math.round(n / sparkGap());
        for (let i = 0; i < count; i++) {
          const px = x + i * step;
          const u = i / (count - 1);
          const py =
            type < 0.5
              ? cy + Math.sin(((i * step) / wl) * TAU) * amp
              : type < 0.8
                ? cy + amp - Math.sin(u * Math.PI) * amp * 2
                : cy + dir * (amp - u * amp * 2);
          pts.push([px, py]);
        }
        addSparks(pts);
        if (R() < 0.55) {
          const ext = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
          addStar(ext[0] + 30, clamp(ext[1] - 90 - R() * 50, TOP + 10, -120), "dew");
        }
        x += count * step + 150 + R() * 220;
        if (R() < 0.3) addCloud(x - 80, -90 - R() * 70, 24 + ((R() * 10) | 0));
      }
    },
    function ray(x0, R) {
      const p = G.p;
      const reach = G.mod.id === "bigstars" ? 1.2 : 1;
      // the first star is in reach right away, with a cloud under it
      let x = p.x + 240;
      let y = clamp(p.y - 150, -620, -330);
      addStar(x, y);
      addCloud(p.x + 210, -120, 34);
      const end = x0 + 13000;
      let i = 0;
      while (x < end) {
        const prog = (x - x0) / 13000;
        const gap = (230 + R() * 70 + prog * 60) * reach;
        const ny = clamp(y + (R() - 0.5) * 300, -650, -300);
        const nx = x + gap;
        // an arc of sparks along a good fling from this star to the next
        const sx = x + 70;
        const sy = y + 120;
        const ex = nx - 50;
        const ey = ny + 100;
        const apex = Math.min(sy, ey) - 70 - R() * 40;
        const arc = [];
        const k = Math.round(4 / sparkGap());
        for (let j = 0; j < k; j++) {
          const u = (j + 0.5) / k;
          arc.push([lerp(sx, ex, u), lerp(sy, ey, u) - 4 * (Math.min(sy, ey) - apex) * u * (1 - u)]);
        }
        addSparks(arc);
        if (i % 7 === 5) {
          // a high golden star above the path: worth the risk
          addStar(x + gap * 0.5, -715, "gold");
          addSparks([
            [x + gap * 0.3, -600],
            [x + gap * 0.4, -660],
          ]);
        }
        if (i % 3 === 1) addCloud(x + gap * 0.5, -110 - R() * 70, 26 + ((R() * 10) | 0));
        x = nx;
        y = ny;
        addStar(x, y);
        i++;
      }
    },
    function goldie(x0, R) {
      const p = G.p;
      const stormy = G.mod.id === "stormy" ? 1.8 : 1;
      // the first cloud goes where you will come down (motion has just been eased to Goldie's)
      let y = clamp(p.y + 200, -330, -120);
      const fall = Math.max(0, y - FEET - p.y);
      const t = (p.vy + Math.sqrt(Math.max(0, p.vy * p.vy + 2 * 1900 * fall))) / 1900 + 0.05;
      let x = p.x + p.vx * t;
      addCloud(x, y, 50);
      const end = x0 + 8200;
      let i = 0;
      while (x < end) {
        const prog = (x - x0) / 8200;
        let gap = 280 + R() * 120 + prog * 50;
        const ny = clamp(y + (R() - 0.5) * 260 + (-260 - y) * 0.35, -430, -110);
        if (ny < y - 60) gap = Math.min(gap, 330);
        x += gap;
        y = ny;
        const storm = i > 1 && R() < (0.22 + 0.12 * prog) * stormy;
        if (storm) {
          addStorm(x, y, 26 + ((R() * 8) | 0));
          if (R() < 0.6) addCloud(x + 190, clamp(y + 130, -400, -100), 26);
        } else addCloud(x, y, 34 + ((R() * 14) | 0));
        // a low, wide safety cloud in most gaps: the safe route, under the risky one
        if (y < -170 && R() < 0.7) addCloud(x - gap * 0.5, -100 - R() * 30, 40 + ((R() * 10) | 0));
        if (i % 2 === 0)
          addSparks([
            [x, y - 280],
            [x + 30, y - 340],
            [x + 60, y - 400],
          ]);
        if (i % 5 === 3) addStar(x + 80, clamp(y - 470, TOP + 20, -300), "star");
        i++;
      }
    },
    function twinkle(x0, R) {
      const p = G.p;
      addStar(p.x + 200, clamp(p.y - 110, -600, -280));
      let x = p.x + 420;
      const end = x0 + 7000;
      let last = -1;
      let note = 0;
      while (x < end) {
        let si = (R() * SHAPES.length) | 0;
        if (si === last) si = (si + 1) % SHAPES.length;
        last = si;
        const sh = SHAPES[si];
        const w = 330 + R() * 120;
        const h = 250 + R() * 110;
        const top = -700 + R() * 110;
        const order = sh.pts.map((pt, k) => [pt[0], k]).sort((a, b) => a[0] - b[0]);
        const con = { name: sh.name, stars: [], edges: sh.edges, done: false, leg: G.leg };
        sh.pts.forEach((pt, k) => {
          const rank = order.findIndex((o) => o[1] === k);
          const st = { x: x + pt[0] * w, y: top + pt[1] * h, kind: "star", lit: false, leg: G.leg, con, ph: rank * 0.17, note: rank, born: G.t };
          G.stars.push(st);
          con.stars.push(st);
        });
        G.consts.push(con);
        x += w + 190;
        const bridges = 1 + ((R() * 2) | 0);
        for (let b = 0; b < bridges; b++) {
          addStar(x, -380 - R() * 120, "star", { ph: (note++ % 5) * 0.2 });
          x += 210;
        }
        x += 60;
      }
    },
    function dreamy(x0, R) {
      let x = x0;
      const end = x0 + 17000;
      let i = 0;
      while (x < end) {
        const kind = i % 4 === 1 ? "skim" : R() < 0.5 ? "high" : "wave";
        const k = Math.round(9 / sparkGap());
        const pts = [];
        if (kind === "skim") for (let j = 0; j < k; j++) pts.push([x + j * 70, -30]);
        else if (kind === "high") {
          for (let j = 0; j < k; j++) pts.push([x + j * 75, -420 - Math.sin((j / (k - 1)) * Math.PI) * 260]);
          addStar(x + (k - 1) * 37, -720, "star");
        } else {
          const cy = -300 - R() * 150;
          for (let j = 0; j < k; j++) pts.push([x + j * 75, cy + Math.sin(j * 0.8) * 90]);
        }
        addSparks(pts);
        x += k * 75 + 260 + R() * 260;
        if (i > 0 && R() < (G.mod.id === "stormy" ? 0.7 : 0.4)) {
          addStorm(x - 120, -260 - R() * 220, 28);
        } else if (R() < 0.35) addCloud(x - 140, -170 - R() * 120, 26);
        i++;
      }
    },
  ];

  function startLeg(k) {
    const p = G.p;
    const prev = G.leg;
    if (prev >= 0) {
      const s = G.legScores[prev];
      const b = G.best?.legs?.[prev];
      G.split = { leg: prev, score: s, diff: b == null ? null : s - b };
      if (G.chain >= 8) {
        act(PTS.relay, 0, p.x, p.y - 60, "Relay!", "#ffdc6e");
        Sound.relay();
      }
      G.old = { key: CAST[prev].key, x: p.x, y: p.y, t: 0, night: prev >= 3 };
    }
    G.leg = k;
    G.legT0 = k * LEG_T;
    G.legX0 = p.x;
    // the sky ahead turns into the next one
    const cut = p.x + 260;
    const gone = (o) => o.x > cut;
    for (const s of G.stars) if (gone(s) && !s.lit) burst(s.x, s.y, "#ffffff", 5, 120);
    G.stars = G.stars.filter((s) => !gone(s) || s.lit);
    G.clouds = G.clouds.filter((c) => !gone(c));
    G.storms = G.storms.filter((s) => !gone(s));
    G.sparks = G.sparks.filter((s) => !gone(s));
    G.consts = G.consts.filter((c) => c.done || c.leg !== prev);
    // carry the motion over to the new move
    G.rope = null;
    G.zip = null;
    G.tap = null;
    G.inv = Math.max(G.inv, 0.9);
    if (k === 2) {
      p.vx = Math.min(p.vx, 460);
      p.vy = clamp(p.vy, -500, 200);
    }
    if (k === 3) {
      p.vy *= 0.35;
      p.vx = 150;
    }
    if (k === 4) {
      G.glide = { a: clamp(Math.atan2(p.vy, Math.max(80, p.vx)), -0.8, 0.7), s: clamp(Math.hypot(p.vx, p.vy), 560, 1000) };
      if (p.y > -260) G.glide.a = Math.min(G.glide.a, -0.35);
    }
    GEN[k](p.x + 420, rng(G.seed ^ Math.imul(k + 1, 0x9e3779b9)));
    G.slow = RM || (BOT && !Q.has("slow")) ? 0 : 0.6;
    if (k > 0) Sound.relay();
    showBanner(k);
  }

  // ---------- feedback ----------
  function burst(x, y, col, n, sp, grav = 0, size = 5) {
    if (G.fx.length > 520) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = sp * (0.4 + Math.random() * 0.8);
      G.fx.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        size: size * (0.6 + Math.random() * 0.8),
        col,
        grav,
      });
    }
  }
  function text(x, y, s, col, size = 24) {
    G.texts.push({ x, y, s, col, size, life: 0.9 });
    if (G.texts.length > 14) G.texts.shift();
  }
  function call(s, sub, col, size = 1) {
    G.calls.push({ s, sub, col, size, life: 1.4 });
    if (G.calls.length > 2) G.calls.shift();
  }
  function shake(a) {
    if (!RM) G.shake = Math.max(G.shake, a);
  }

  // ---------- the moves ----------
  function reachOf() {
    return (G.leg === 3 ? 390 : 320) * (G.mod.id === "bigstars" ? 1.2 : 1);
  }
  function rayTarget() {
    const p = G.p;
    const R = reachOf();
    let best = null;
    let bestC = Infinity;
    for (const s of G.stars) {
      if (s.leg !== 1 && G.leg === 1 && !s.lit) continue;
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      if (dx < -30 || dy > 40) continue;
      const d = Math.hypot(dx, dy);
      if (d > R || d < 40) continue;
      const c = d + (s.lit ? 90 : 0) - dx * 0.3;
      if (c < bestC) {
        bestC = c;
        best = s;
      }
    }
    return best;
  }
  function twinkleTarget(tx, ty) {
    const p = G.p;
    const R = reachOf();
    let best = null;
    let bestC = Infinity;
    for (const s of G.stars) {
      if (s === G.zipFrom) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d > R || d < 20) continue;
      let c;
      if (tx != null) {
        const dt = Math.hypot(s.x - tx, s.y - ty);
        if (dt > 120) continue;
        c = dt;
      } else {
        if (s.x < p.x - 40) continue;
        c = d - (s.x - p.x) * 0.2 + (s.lit ? 400 : 0);
      }
      if (c < bestC) {
        bestC = c;
        best = s;
      }
    }
    return best;
  }
  const brightNow = (s) => (((G.t / 1.2 - s.ph) % 1) + 1) % 1 < 0.3;

  function lightStar(s, how) {
    if (s.lit) return false;
    s.lit = true;
    s.litT = G.t;
    G.stats.lit++;
    G.litLog.push({ y: s.y, leg: G.leg, kind: s.kind });
    let pts = s.kind === "gold" ? PTS.gold : s.kind === "dew" ? PTS.dew : PTS.star;
    let add = s.kind === "gold" ? 3 : 1;
    let label = s.kind === "gold" ? "Golden star" : null;
    if (how === "bright") {
      pts *= 2;
      add++;
      label = "Bright!";
    }
    act(pts, add, s.x, s.y - 34, label, s.kind === "gold" || how === "bright" ? "#ffdc6e" : "#ffffff");
    Sound.star(s.note != null ? s.note + 3 : Math.min(14, 4 + (G.chain % 10)));
    burst(s.x, s.y, "#ffdc6e", 12, 260, 0, 6);
    buzz(8);
    if (s.con) {
      const c = s.con;
      if (!c.done && c.stars.every((st) => st.lit)) {
        c.done = true;
        G.stats.consts++;
        G.constLog.push(c.name);
        if (!found.has(c.name)) {
          found.add(c.name);
          G.newFound.push(c.name);
          store.set("found", [...found]);
        }
        act(PTS.shapePer * c.stars.length, 2, s.x, s.y - 70, c.name, "#ffdc6e");
        call(c.name, "Constellation lit", "#ffdc6e");
        Sound.phrase(c.stars.map((st) => (st.note ?? 0) + 3).sort((a, b) => a - b));
        for (const st of c.stars) burst(st.x, st.y, "#fff3c4", 10, 200, 0, 5);
      }
    }
    return true;
  }

  function moveFloat(dt) {
    const p = G.p;
    p.vy += (held ? -1250 : 1250) * dt;
    p.vy = clamp(p.vy, -540, 600);
    p.vx = lerp(p.vx, 340 + windOf(), Math.min(1, dt * 2));
  }
  function windOf() {
    return G.mod.id === "windy" ? 70 : 0;
  }
  function moveSwing(dt) {
    const p = G.p;
    if (held && !G.rope) {
      const s = rayTarget();
      if (s) {
        G.rope = { s, len: Math.hypot(s.x - p.x, s.y - p.y), min: 0, t: 0 };
        G.rope.min = Math.max(90, G.rope.len * 0.84);
        // a forward kick along the swing so a slow catch never just hangs
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        let tx = -dy / d;
        let ty = dx / d;
        if (tx < 0) {
          tx = -tx;
          ty = -ty;
        }
        const vt = p.vx * tx + p.vy * ty;
        if (vt < 430) {
          p.vx += (430 - vt) * tx;
          p.vy += (430 - vt) * ty;
        }
        Sound.grab();
        buzz(6);
        if (!lightStar(s)) act(PTS.again, 1, null);
      }
    }
    if (G.rope && !held) {
      const sp = Math.hypot(p.vx, p.vy);
      if (G.perfectNow) {
        p.vx *= 1.12;
        p.vy *= 1.12;
        G.stats.perfects++;
        act(PTS.perfect, 1, p.x, p.y - 50, "Perfect!", "#ffdc6e");
        Sound.perfect();
        burst(p.x, p.y, "#ffdc6e", 10, 220);
      } else if (sp > 400) Sound.whoosh();
      G.rope = null;
    }
    p.vy += 2100 * dt;
    if (G.rope) {
      const r = G.rope;
      r.t += dt;
      const dy0 = p.y - r.s.y;
      if (dy0 > 0) {
        // a little pump on the way down keeps the swing lively
        const d = Math.hypot(p.vx, p.vy) || 1;
        p.vx += (p.vx / d) * 260 * dt;
        p.vy += (p.vy / d) * 260 * dt;
      }
      r.len = Math.max(r.min, r.len - 260 * dt);
    }
    const sp = Math.hypot(p.vx, p.vy);
    if (sp > 1600) {
      p.vx *= 1600 / sp;
      p.vy *= 1600 / sp;
    }
    const ang = Math.atan2(-p.vy, p.vx);
    G.perfectNow = !!G.rope && p.vx > 0 && ang > 0.35 && ang < 1.15 && sp > 640 && p.y > G.rope.s.y - 40;
  }
  function constrainRope() {
    const r = G.rope;
    if (!r) return;
    const p = G.p;
    const dx = p.x - r.s.x;
    const dy = p.y - r.s.y;
    const d = Math.hypot(dx, dy);
    if (d > r.len) {
      const nx = dx / d;
      const ny = dy / d;
      p.x = r.s.x + nx * r.len;
      p.y = r.s.y + ny * r.len;
      const vr = p.vx * nx + p.vy * ny;
      if (vr > 0) {
        p.vx -= vr * nx;
        p.vy -= vr * ny;
      }
    }
  }
  const GOLDIE_VX = 330;
  const POP_VY = -1220;
  function moveBounce(dt) {
    const p = G.p;
    p.vy += (held ? 1900 + 4200 : 1900) * dt;
    p.vy = Math.min(p.vy, held ? 1650 : 1150);
    p.vx = lerp(p.vx, GOLDIE_VX + windOf(), Math.min(1, dt * 2.5));
  }
  function moveLight(dt) {
    const p = G.p;
    if (G.tap) {
      if (!G.zip) {
        const s = twinkleTarget(G.tap.x, G.tap.y) || twinkleTarget();
        if (s) {
          G.zip = { s };
          Sound.whoosh();
        } else G.stats.whiffs++;
        G.tap = null;
      } else if (G.t - G.tap.t > 0.4) G.tap = null;
    }
    if (G.zip) {
      const s = G.zip.s;
      const dx = s.x - p.x;
      const dy = s.y - p.y;
      const d = Math.hypot(dx, dy);
      const step = 2200 * dt;
      if (d <= step) {
        p.x = s.x;
        p.y = s.y;
        p.vx = 150 + windOf() * 0.5;
        p.vy = -360;
        G.zip = null;
        G.zipFrom = s;
        if (!lightStar(s, brightNow(s) ? "bright" : null)) act(PTS.again, 1, null);
        burst(p.x, p.y, "#cfe0ff", 8, 180);
      } else {
        p.vx = (dx / d) * 2200;
        p.vy = (dy / d) * 2200;
      }
      return;
    }
    p.vy = Math.min(p.vy + 650 * dt, 420);
    p.vx = lerp(p.vx, 130 + windOf() * 0.5, Math.min(1, dt));
  }
  function moveGlide(dt) {
    const p = G.p;
    const g = G.glide;
    if (held) g.a -= 3.3 * dt;
    else g.a += 1.9 * dt;
    if (g.s < 250) g.a += 2.2 * dt;
    g.a = clamp(g.a, -1.05, 0.85);
    if (p.y < TOP - 60) g.a = Math.max(g.a, 0.15);
    g.s += (1350 * Math.sin(g.a) - 0.00028 * g.s * g.s + 70 + windOf()) * dt;
    g.s = clamp(g.s, 170, 1350);
    p.vx = g.s * Math.cos(g.a);
    p.vy = g.s * Math.sin(g.a);
    // skimming the sea: fast and low is worth the most
    if (p.y > -66 && g.s > 520 && G.rescue <= 0) {
      G.skimT += dt;
      if (G.skimT > 0.2) {
        G.skimT = 0;
        G.skimN++;
        G.stats.skims++;
        act(PTS.skim, G.skimN % 2, null);
        if (G.skimN === 1) text(p.x, p.y - 50, "Moon skim", "#cfe0ff", 26);
        Sound.spark(G.skimN % 10);
      }
      if (Math.random() < 0.6)
        G.fx.push({
          x: p.x - 10,
          y: -4,
          vx: -100 - Math.random() * 200,
          vy: -150 - Math.random() * 200,
          life: 0.5,
          max: 0.5,
          size: 5,
          col: "#dfe9ff",
          grav: 900,
        });
    } else G.skimN = 0;
  }
  const MOVES = [moveFloat, moveSwing, moveBounce, moveLight, moveGlide];

  // ---------- one step of the world ----------
  function step(dt) {
    G.t += dt;
    const k = Math.min(4, Math.floor(G.t / LEG_T));
    if (G.t >= DAY_T) return endRound();
    if (k !== G.leg) startLeg(k);
    const p = G.p;
    if (G.inv > 0) G.inv -= dt;
    if (G.hurt > 0) G.hurt -= dt;
    if (G.rescue > 0) {
      G.rescue -= dt;
      if (G.rescue <= 0) {
        p.y = -40;
        p.vy = -1180;
        p.vx = 380;
        G.inv = 1.1;
        G.hurt = 1.1;
        G.puffT = 0.9;
        if (G.leg === 4) G.glide = { a: -0.75, s: 980 };
        Sound.puff();
        text(p.x, p.y - 60, "Puff caught you", "#ffffff", 24);
      }
      return;
    }
    MOVES[G.leg](dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (G.leg === 1) constrainRope();
    if (G.leg !== 4 && p.y < TOP - 80 && p.vy < 0) p.vy *= 0.9;
    collide(dt);
    // Dreamy skips off the sea like a stone when it comes in shallow; a steep dive splashes
    if (G.leg === 4 && p.y > SEA - 16 && G.glide.a < 0.42 && G.rescue <= 0) {
      p.y = SEA - 17;
      G.glide.a = -0.42;
      G.glide.s = Math.max(520, G.glide.s * 0.94);
      G.stats.skips = (G.stats.skips || 0) + 1;
      act(PTS.skip, 1, p.x, p.y - 50, "Skip!", "#cfe0ff");
      Sound.bounce();
      burst(p.x, SEA, "#e8f1ff", 10, 260, 1200, 5);
      buzz(8);
    }
    // the sea
    if (p.y > SEA - 16 && G.rescue <= 0) {
      G.rescue = 0.65;
      G.stats.falls++;
      G.legFalls[G.leg]++;
      G.rope = null;
      G.zip = null;
      p.y = SEA - 10;
      burst(p.x, SEA, "#e8f1ff", 18, 380, 1400, 6);
      Sound.splash();
      shake(10);
      buzz(25);
      breakChain("Splash");
    }
    // sparks you flew past without catching break that line's bonus
    for (const s of G.sparks) if (!s.got && s.x < p.x - 70) G.groups[s.g].missed = true;
    // forget what's far behind
    G.pruneT = (G.pruneT || 0) + dt;
    if (G.pruneT > 1) {
      G.pruneT = 0;
      const cut = p.x - 900;
      G.sparks = G.sparks.filter((s) => s.x > cut);
      G.clouds = G.clouds.filter((c) => c.x > cut);
      G.storms = G.storms.filter((s) => s.x > cut);
      G.stars = G.stars.filter((s) => s.x > cut);
    }
    // ghost and pace records
    G.recT += dt;
    if (G.recT >= 1 / 30) {
      G.recT = 0;
      G.rec[G.leg].push(Math.round(p.x - G.legX0), Math.round(p.y));
    }
    G.tlT += dt;
    if (G.tlT >= 0.5) {
      G.tlT = 0;
      G.timeline.push(G.score);
    }
  }

  function collide() {
    const p = G.p;
    const zipping = !!G.zip;
    // sparks
    for (const s of G.sparks) {
      if (s.got || Math.abs(s.x - p.x) > 36 || Math.abs(s.y - p.y) > 36) continue;
      if (Math.hypot(s.x - p.x, s.y - p.y) > 34) continue;
      s.got = true;
      const g = G.groups[s.g];
      g.got++;
      G.sparkStreak = G.t - G.sparkT < 0.6 ? G.sparkStreak + 1 : 0;
      G.sparkT = G.t;
      Sound.spark(G.sparkStreak);
      act(PTS.spark, 1, null);
      burst(s.x, s.y, "#fff3c4", 4, 120, 0, 4);
      if (g.got === g.n && !g.missed && !g.done && g.n >= 3) {
        g.done = true;
        G.stats.lines++;
        act(PTS.linePer * g.n, 1, s.x, s.y - 40, "Full line", "#ffdc6e");
      }
    }
    // stars you touch (every leg but Ray's and Twinkle's, which catch them)
    if (G.leg === 0 || G.leg === 2 || G.leg === 4)
      for (const s of G.stars) if (!s.lit && Math.abs(s.x - p.x) < 40 && Math.hypot(s.x - p.x, s.y - p.y) < 40) lightStar(s);
    if (zipping) return;
    // clouds catch you from above
    const bottom = p.y + FEET;
    for (const c of G.clouds) {
      if (c.popped || p.vy <= 0 || Math.abs(p.x - c.x) > c.hw - 4) continue;
      if (bottom < c.y - 4 || bottom > c.y + 22) continue;
      if (G.leg === 1 && G.rope) continue;
      p.y = c.y - FEET;
      c.squish = 1;
      G.squash = 1;
      if (G.leg === 2) {
        if (held && p.vy > 850) {
          c.popped = true;
          p.vy = POP_VY;
          G.stats.pops++;
          act(PTS.pop, 1, c.x, c.y - 30, "Pop", "#ffffff");
          Sound.pop();
          burst(c.x, c.y + 6, "#ffffff", 16, 300, 300, 7);
          buzz(10);
        } else {
          p.vy = -930;
          act(PTS.bounce, 1, null);
          Sound.bounce();
        }
      } else if (G.leg === 0) {
        p.vy = -560;
        Sound.bounce();
      } else if (G.leg === 3) {
        p.vy = -430;
        Sound.bounce();
      } else if (G.leg === 4) {
        G.glide.a = -0.7;
        G.glide.s = Math.max(G.glide.s, 760);
        Sound.bounce();
      } else {
        p.vy = -860;
        Sound.bounce();
      }
    }
    // storms zap you, except Goldie diving on them from above. Fair both ways: a dive clears from a generous area, a zap
    // needs a real touch (smaller than the storm looks)
    const inside = (s, ex, ey) => {
      const nx = (p.x - s.x) / (s.rx + ex);
      const ny = (p.y - (s.y + 6)) / (s.ry + ey);
      return nx * nx + ny * ny <= 1;
    };
    for (const s of G.storms) {
      if (s.dead) continue;
      const diving = G.leg === 2 && held && p.vy > 650 && p.y < s.y;
      if (diving ? !inside(s, 22, 30) : !inside(s, -8, 6)) continue;
      if (diving) {
        s.dead = true;
        s.deadT = G.t;
        p.vy = POP_VY;
        G.stats.storms++;
        act(G.mod.id === "stormy" ? PTS.stormy : PTS.storm, 2, s.x, s.y - 40, "Cleared", "#ffdc6e");
        Sound.clear();
        burst(s.x, s.y, "#ffe9a8", 24, 420, 0, 7);
        shake(5);
        buzz(15);
      } else if (G.inv <= 0) {
        G.inv = 1;
        G.hurt = 1;
        G.stats.zaps++;
        p.vy = 380;
        p.vx *= 0.5;
        G.rope = null;
        if (G.leg === 4) G.glide = { a: 0.5, s: Math.max(300, G.glide.s * 0.6) };
        Sound.zap();
        shake(8);
        buzz(30);
        burst(p.x, p.y, "#cfe0ff", 10, 300);
        breakChain("Zap");
      }
    }
  }

  // ---------- input ----------
  function press(e) {
    if (state !== "play") return;
    Sound.unlock();
    held = true;
    G.stats.presses++;
    if (G.leg === 3) {
      const wx = e && e.clientX != null ? G.camX + e.clientX / SC : null;
      const wy = e && e.clientY != null ? camY() + e.clientY / SC : null;
      G.tap = { x: wx, y: wy, t: G.t };
    }
  }
  function release() {
    held = false;
  }
  cv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try {
      cv.setPointerCapture(e.pointerId);
    } catch {}
    if (state === "end") return showCard();
    press(e);
  });
  cv.addEventListener("pointerup", release);
  cv.addEventListener("pointercancel", release);
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") {
      if (state === "play") e.preventDefault();
      if (!e.repeat) state === "end" ? showCard() : press(null);
    }
    if (e.code === "Escape" && state === "play") pause();
    if (e.code === "KeyR" && (state === "end" || state === "pause")) play(G.mode);
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" || e.code === "ArrowUp") release();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "play") pause();
  });

  // ---------- the bot (?bot=1), for checking that every sky can be crossed ----------
  function bot() {
    bot1();
    G.botHeld = held;
  }
  function bot1() {
    const p = G.p;
    const ahead = (arr, f) => arr.filter((o) => o.x > p.x + 10 && o.x < p.x + 600 && f(o)).sort((a, b) => a.x - b.x)[0];
    if (G.rescue > 0) return (held = false);
    if (G.leg === 0) {
      const s = ahead(G.sparks, (s) => !s.got) || ahead(G.stars, (s) => !s.lit);
      held = s ? s.y < p.y - 8 : p.y > -320;
      if (p.y > -110) held = true;
    } else if (G.leg === 1) {
      if (G.rope) {
        held = !(G.perfectNow || (p.vx > 200 && p.vy < -300 && p.y < G.rope.s.y + 60));
      } else held = p.vy > -80 && !!rayTarget();
    } else if (G.leg === 2) {
      const plats = [
        ...G.clouds.filter((c) => !c.popped),
        ...G.storms.filter((s) => !s.dead).map((s) => ({ x: s.x, y: s.y - 30, hw: s.rx + 22, storm: true })),
      ];
      const lands = (after) => {
        let x = p.x;
        let y = p.y;
        let vx = p.vx;
        let vy = p.vy;
        for (let i = 0; i < 300; i++) {
          const dt = 1 / 120;
          const dive = i / 120 >= after;
          vy = Math.min(vy + (dive ? 6100 : 1900) * dt, dive ? 1650 : 1150);
          vx += (GOLDIE_VX + windOf() - vx) * Math.min(1, dt * 2.5);
          x += vx * dt;
          y += vy * dt;
          if (vy > 0) for (const c of plats) if (Math.abs(x - c.x) < c.hw - 10 && y + FEET >= c.y - 4 && y + FEET <= c.y + 22) return c;
          if (y > -16) return null;
        }
        return null;
      };
      // dive now if diving now lands well; otherwise wait if a later dive (or none) does
      const now = lands(0);
      if (now && (now.storm || !now.popped)) held = true;
      else {
        held = false;
        G.botMiss = ![0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.2, 9].some((d) => lands(d));
      }
    } else if (G.leg === 3) {
      if (!G.zip && !G.tap && (p.vy > 60 || p.y > -260)) {
        const s = G.stars
          .filter((s) => !s.lit && s !== G.zipFrom && Math.hypot(s.x - p.x, s.y - p.y) < reachOf() * 0.95)
          .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        const any = s || twinkleTarget();
        if (any) G.tap = { x: any.x, y: any.y, t: G.t };
      }
    } else {
      const s = ahead(G.sparks, (s) => !s.got && s.x > p.x + 80) || ahead(G.stars, (s) => !s.lit);
      const storm = G.storms.find((s) => !s.dead && s.x > p.x && s.x < p.x + 380 && Math.abs(s.y - p.y) < 110);
      held = s ? s.y < p.y + 30 : p.y > -350;
      if (storm) held = storm.y > p.y - 20;
      if (p.y > -220 && G.glide.a > 0.3) held = true;
    }
  }

  // ---------- drawing ----------
  const camY = () => 110 - VH;
  const BG_STARS = Array.from({ length: 140 }, (_, i) => {
    const r = rng(i * 7919 + 13);
    return { x: r(), y: r() * 0.62, s: r() < 0.15 ? 2 : 1, ph: r() * TAU };
  });
  const FAR = Array.from({ length: 9 }, (_, i) => {
    const r = rng(i * 104729 + 7);
    return { x: r() * 3600, y: 0.12 + r() * 0.42, w: 26 + ((r() * 18) | 0), sp: 0.06 + r() * 0.12 };
  });

  function render(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const p = state === "menu" ? menuP() : state === "end" ? 1 : clamp(G.t / DAY_T, 0, 1);
    const [top, mid, hor] = skyAt(p);
    const cy = camY();
    const horizon = (SEA - cy) * SC;
    const camX = G ? G.camX : 0;
    // sky
    const gr = ctx.createLinearGradient(0, 0, 0, horizon);
    gr.addColorStop(0, css(top));
    gr.addColorStop(0.55, css(mid));
    gr.addColorStop(1, css(hor));
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, horizon + 1);
    // stars come out
    const night = clamp((p - 0.62) / 0.16, 0, 1);
    if (night > 0) {
      const vt = G ? G.vt : performance.now() / 1000;
      for (const s of BG_STARS) {
        const x = (((s.x * W * 1.6 - camX * SC * 0.03) % (W * 1.6)) + W * 1.6) % (W * 1.6);
        if (x > W) continue;
        ctx.globalAlpha = night * (0.45 + 0.4 * Math.sin(vt * 1.7 + s.ph));
        ctx.fillStyle = "#eef3ff";
        ctx.fillRect(x, s.y * horizon, s.s * 1.5, s.s * 1.5);
      }
      ctx.globalAlpha = 1;
    }
    drawSunMoon(p, horizon);
    // far clouds drift
    ctx.imageSmoothingEnabled = false;
    for (const c of FAR) {
      const w = c.w * 4 * SC * 0.8;
      const x = (((((c.x - camX * c.sp) * SC) % (3600 * SC * 0.5)) + 3600 * SC * 0.5) % (3600 * SC * 0.5)) - w;
      if (x > W) continue;
      ctx.globalAlpha = 0.28 + 0.2 * (1 - night);
      ctx.drawImage(cloudArt(c.w, legForSky(p)), x, c.y * horizon, w, 7 * 4 * SC * 0.8);
    }
    ctx.globalAlpha = 1;
    // the world
    const sh = G && G.shake > 0 ? G.shake : 0;
    const ox = sh ? (Math.random() - 0.5) * sh : 0;
    const oy = sh ? (Math.random() - 0.5) * sh : 0;
    ctx.setTransform(DPR * SC, 0, 0, DPR * SC, DPR * (-camX * SC + ox), DPR * (-cy * SC + oy));
    drawSea(camX, cy, p, top, mid, hor);
    if (G && (state === "play" || state === "pause")) drawWorld();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (state === "end") drawNightSky();
    if (G && (state === "play" || state === "pause")) drawCalls();
    if (DEBUG && G) {
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.fillText(`fps ${(1 / Math.max(dt, 0.001)).toFixed(0)} x ${G.p.x | 0} y ${G.p.y | 0} vx ${G.p.vx | 0} vy ${G.p.vy | 0}`, 10, H - 12);
    }
  }
  function legForSky(p) {
    return p < 0.18 ? 0 : p < 0.45 ? 1 : p < 0.62 ? 2 : p < 0.78 ? 3 : 4;
  }
  function menuP() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h < 5) return 0.95;
    if (h < 7) return lerp(0, 0.15, (h - 5) / 2);
    if (h < 17) return lerp(0.15, 0.5, (h - 7) / 10);
    if (h < 20) return lerp(0.5, 0.72, (h - 17) / 3);
    return lerp(0.72, 0.95, (h - 20) / 4);
  }
  function drawSunMoon(p, horizon) {
    if (p < 0.69) {
      const q = clamp((p - 0.02) / 0.66, 0, 1);
      const x = lerp(W * 0.12, W * 0.9, q);
      // the sun keeps to the top of the sky, above where you play
      const y = horizon - Math.sin(q * Math.PI) * horizon * 0.86 + 8;
      const r = Math.max(18, 24 * Math.min(1, SC * 1.4));
      const warm = 1 - Math.sin(q * Math.PI);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.32;
      ctx.drawImage(glowArt(warm > 0.5 ? "rgba(255,170,90,0.9)" : "rgba(255,240,200,0.9)"), x - r * 3.4, y - r * 3.4, r * 6.8, r * 6.8);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.imageSmoothingEnabled = false;
      const a = sunArt();
      ctx.drawImage(a, x - r, y - r, r * 2, r * 2);
    }
    if (p > 0.7) {
      const q = clamp((p - 0.7) / 0.3, 0, 1);
      const x = lerp(W * 0.86, W * 0.66, q);
      const y = lerp(horizon - 10, horizon * 0.22, Math.sin((q * Math.PI) / 2));
      const r = Math.max(34, 46 * Math.min(1, SC * 1.4));
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glowArt("rgba(200,220,255,0.8)"), x - r * 3, y - r * 3, r * 6, r * 6);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#e9eefb";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#c9d3ea";
      for (const [cx, cy2, cr] of [
        [-0.3, -0.2, 0.18],
        [0.25, 0.15, 0.13],
        [-0.05, 0.4, 0.1],
        [0.35, -0.35, 0.08],
      ]) {
        ctx.beginPath();
        ctx.arc(x + cx * r, y + cy2 * r, cr * r, 0, TAU);
        ctx.fill();
      }
    }
  }
  function drawSea(camX, cy, p, top, mid, hor) {
    const x0 = camX - 20;
    const w = VW + 40;
    const depth = VH + cy - SEA + 40;
    const g = ctx.createLinearGradient(0, SEA, 0, SEA + Math.max(60, depth));
    g.addColorStop(0, css(mixc(hor, mid, 0.45)));
    g.addColorStop(1, css(mixc(mid, top, 0.75).map((v) => v * 0.7)));
    ctx.fillStyle = g;
    ctx.fillRect(x0, SEA, w, Math.max(60, depth));
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillRect(x0, SEA - 1.5, w, 3);
    // the light on the water
    const vt = G ? G.vt : performance.now() / 1000;
    ctx.fillStyle = p < 0.69 ? "rgba(255,236,190,0.55)" : "rgba(220,232,255,0.45)";
    const lx = camX + (p < 0.69 ? lerp(0.12, 0.9, clamp((p - 0.02) / 0.66, 0, 1)) : lerp(0.86, 0.66, clamp((p - 0.7) / 0.3, 0, 1))) * VW;
    for (let i = 0; i < 7; i++) {
      const yy = SEA + 8 + i * 12;
      const ww = 70 - i * 6 + Math.sin(vt * 2 + i) * 10;
      ctx.fillRect(lx - ww / 2 + Math.sin(vt * 1.3 + i * 2) * 8, yy, ww, 3);
    }
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let i = 0; i < 14; i++) {
      const wx = Math.floor(camX / 180) * 180 + i * 180 + ((i * 97) % 60);
      ctx.fillRect(wx + Math.sin(vt + i) * 6, SEA + 22 + ((i * 37) % 60), 26, 2);
    }
  }

  function poseFor() {
    const p = G.p;
    const vt = G.vt;
    const blink = vt % 3.1 < 0.12 ? 1 : 0;
    switch (G.leg) {
      case 0:
        return held ? ["stretch", ((vt * 4) | 0) % 2] : p.vy > 250 && p.y > -140 ? ["surprised", 0] : ["idle", blink];
      case 1:
        if (G.rope) return ["wave", 0];
        if (p.vy < -150) return ["celebrate", 2];
        return p.y > -150 && p.vy > 200 ? ["surprised", 0] : ["idle", blink];
      case 2:
        if (held && p.vy > 300) return ["celebrate", 0];
        return p.vy < -200 ? ["celebrate", 1] : ["idle", blink];
      case 3:
        if (G.zip) return ["celebrate", 2];
        return p.y > -150 && p.vy > 150 ? ["surprised", 0] : ["wave", ((vt * 3) | 0) % 2];
      default:
        if (p.y > -60) return ["celebrate", 2];
        return held ? ["stretch", 1] : ["idle", blink];
    }
  }

  function drawSkyling(key, pose, frame, night, x, y, tilt, alpha, sx = 1, sy = 1) {
    const img = sprite(key, pose, frame, night);
    const s = 24 * U;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.scale(sx, sy);
    ctx.globalAlpha = alpha;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, -12 * U, -14 * U, s, s);
    ctx.restore();
  }

  function drawWorld() {
    const p = G.p;
    const vt = G.vt;
    const L = G.camX - 120;
    const R = G.camX + VW + 120;
    const inView = (o) => o.x > L && o.x < R;
    const night = G.leg >= 3;
    ctx.imageSmoothingEnabled = false;
    // constellation lines
    for (const c of G.consts) {
      for (const [a, b] of c.edges) {
        const A = c.stars[a];
        const B = c.stars[b];
        if (!A || !B || (!inView(A) && !inView(B))) continue;
        const both = A.lit && B.lit;
        ctx.strokeStyle = c.done ? "rgba(255,220,110,0.95)" : both ? "rgba(255,236,170,0.7)" : "rgba(255,255,255,0.28)";
        ctx.lineWidth = c.done ? 4 : 2.5;
        ctx.setLineDash(both || c.done ? [] : [6, 9]);
        ctx.beginPath();
        ctx.moveTo(A.x, A.y);
        ctx.lineTo(B.x, B.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    // clouds
    for (const c of G.clouds) {
      if (!inView(c) || c.popped) continue;
      c.squish = Math.max(0, c.squish - 0.06);
      const w = c.w * 4;
      const sq = 1 - 0.18 * c.squish;
      const fade = clamp((G.t - c.born) * 3, 0, 1);
      ctx.globalAlpha = fade;
      ctx.drawImage(cloudArt(c.w, c.leg), c.x - (w * (2 - sq)) / 2, c.y - 8 + (1 - sq) * 20, w * (2 - sq), 28 * sq);
    }
    ctx.globalAlpha = 1;
    // storms
    for (const s of G.storms) {
      if (!inView(s)) continue;
      if (s.dead) {
        const k = (G.t - s.deadT) * 2;
        if (k < 1) {
          ctx.globalAlpha = 1 - k;
          ctx.globalCompositeOperation = "lighter";
          ctx.drawImage(glowArt("rgba(255,230,150,1)"), s.x - 120 * (1 + k), s.y - 120 * (1 + k), 240 * (1 + k), 240 * (1 + k));
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = 1;
        }
        continue;
      }
      const w = s.w * 5;
      const bob = Math.sin(vt * 1.6 + s.ph) * 4;
      // rain behind
      ctx.fillStyle = "rgba(170,190,225,0.55)";
      for (let i = 0; i < 9; i++) {
        const rx = s.x - w / 2 + 14 + i * ((w - 28) / 8);
        const ry = s.y + 26 + ((vt * 260 + i * 37) % 70);
        ctx.fillRect(rx, ry + bob, 2.5, 12);
      }
      ctx.drawImage(stormArt(s.w), s.x - w / 2, s.y - 10 + bob, w, 35);
      // a slow flash (well under 3 a second)
      const fl = (vt + s.ph) % 2.6 < 0.08;
      if (fl && !RM) {
        ctx.strokeStyle = "#fff6c8";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(s.x + 6, s.y + 20 + bob);
        ctx.lineTo(s.x - 6, s.y + 40 + bob);
        ctx.lineTo(s.x + 4, s.y + 44 + bob);
        ctx.lineTo(s.x - 8, s.y + 66 + bob);
        ctx.stroke();
      }
      // the face that says "not from the side"
      ctx.fillStyle = "#262320";
      ctx.fillRect(s.x - 14, s.y + 4 + bob, 4, 4);
      ctx.fillRect(s.x + 10, s.y + 4 + bob, 4, 4);
      ctx.fillRect(s.x - 18, s.y - 1 + bob, 8, 3);
      ctx.fillRect(s.x + 10, s.y - 1 + bob, 8, 3);
    }
    // the target (what holding would catch)
    let target = null;
    if (state === "play" && G.rescue <= 0) {
      if (G.leg === 1 && !G.rope) target = rayTarget();
      if (G.leg === 3 && !G.zip) target = twinkleTarget();
    }
    // sparks
    for (const s of G.sparks) {
      if (s.got || !inView(s)) continue;
      const tw = 1 + 0.15 * Math.sin(vt * 6 + s.x * 0.05);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.55;
      ctx.drawImage(glowArt("rgba(255,230,160,0.9)"), s.x - 18 * tw, s.y - 18 * tw, 36 * tw, 36 * tw);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff6d8";
      ctx.fillRect(s.x - 2, s.y - 6, 4, 12);
      ctx.fillRect(s.x - 6, s.y - 2, 12, 4);
      ctx.fillStyle = "#ffdc6e";
      ctx.fillRect(s.x - 2, s.y - 2, 4, 4);
    }
    // stars
    for (const s of G.stars) {
      if (!inView(s)) continue;
      const fade = clamp((G.t - s.born) * 2.5, 0, 1);
      const bright = G.leg === 3 && s.leg === 3 && !s.lit && brightNow(s);
      const pulse = s.lit ? 1 + 0.08 * Math.sin(vt * 4 + s.x) : bright ? 1.3 : 1;
      const size = (s.kind === "gold" ? 46 : s.kind === "dew" ? 34 : 38) * pulse;
      if (s.lit || bright || s.kind === "gold") {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = (s.lit ? 0.7 : 0.5) * fade;
        ctx.drawImage(
          glowArt(s.lit || s.kind === "gold" ? "rgba(255,210,90,0.9)" : "rgba(210,225,255,0.9)"),
          s.x - size * 1.4,
          s.y - size * 1.4,
          size * 2.8,
          size * 2.8,
        );
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.globalAlpha = fade;
      ctx.drawImage(starArt(s.lit ? "lit" : s.kind === "gold" ? "gold" : "dim"), s.x - size / 2, s.y - size / 2, size, size);
      ctx.globalAlpha = 1;
    }
    if (target) {
      const r = 34 + 5 * Math.sin(vt * 8);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 8]);
      ctx.lineDashOffset = -vt * 30;
      ctx.beginPath();
      ctx.arc(target.x, target.y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // the ghost of your best run on this sky
    if (G.ghost && G.ghost.rec?.[G.leg]) {
      const rec = G.ghost.rec[G.leg];
      const i = Math.floor((G.t - G.legT0) * 30) * 2;
      if (i + 1 < rec.length) drawSkyling(CAST[G.leg].key, "idle", 0, night, G.legX0 + rec[i], rec[i + 1], 0, 0.3);
    }
    // the rope
    if (G.rope) {
      const s = G.rope.s;
      const gold = G.perfectNow;
      if (gold) {
        ctx.strokeStyle = "rgba(255,210,90,0.45)";
        ctx.lineWidth = 12;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 22);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      ctx.strokeStyle = gold ? "#ffdc6e" : "rgba(255,255,255,0.9)";
      ctx.lineWidth = gold ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 22);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    // trails
    const cast = CAST[G.leg];
    const sp = Math.hypot(p.vx, p.vy);
    G.trailT += 1 / 60;
    if (state === "play" && G.rescue <= 0 && sp > 300 && G.trailT > (unlocked.has(cast.key) ? 0.02 : 0.05)) {
      G.trailT = 0;
      const mine = unlocked.has(cast.key);
      G.fx.push({
        x: p.x - p.vx * 0.03,
        y: p.y + 6 - p.vy * 0.03,
        vx: -p.vx * 0.1,
        vy: -p.vy * 0.1 + (mine ? 20 : 0),
        life: mine ? 0.7 : 0.35,
        max: mine ? 0.7 : 0.35,
        size: mine ? 7 : 4,
        col: mine ? cast.trail : "rgba(255,255,255,0.7)",
        grav: 0,
        trail: mine,
      });
    }
    // the old skyling waves goodbye
    if (G.old) {
      G.old.t += 1 / 60;
      const o = G.old;
      if (o.t > 1) G.old = null;
      else drawSkyling(o.key, "wave", ((o.t * 6) | 0) % 2, o.night, o.x - o.t * 120, o.y - o.t * 220, 0, 1 - o.t);
    }
    // the skyling
    if (G.rescue <= 0) {
      const [pose, fr] = poseFor();
      let tilt = 0;
      if (G.rope) tilt = clamp(Math.atan2(G.rope.s.x - p.x, p.y - G.rope.s.y), -0.7, 0.7);
      else if (G.leg === 4) tilt = G.glide.a * 0.6;
      else tilt = clamp(p.vx / 2400 + p.vy / 4000, -0.35, 0.35);
      G.squash = Math.max(0, G.squash - 0.07);
      const sx = 1 + 0.22 * G.squash;
      const sy = 1 - 0.22 * G.squash;
      const blink = G.hurt > 0 && ((G.vt * 12) | 0) % 2 === 0;
      drawSkyling(cast.key, pose, fr, night, p.x, p.y, tilt, blink ? 0.35 : 1, sx, sy);
    }
    // Puff
    if (G.rescue > 0 || G.puffT > 0) {
      if (G.rescue <= 0) G.puffT -= 1 / 60;
      const k = G.rescue > 0 ? 1 - G.rescue / 0.65 : 1;
      const a = puffArt();
      ctx.globalAlpha = G.rescue > 0 ? 1 : clamp(G.puffT, 0, 1);
      ctx.drawImage(a, p.x - 36, SEA - 40 * k, 72, 48);
      ctx.globalAlpha = 1;
    }
    // particles
    for (const f of G.fx) {
      ctx.globalAlpha = clamp(f.life / f.max, 0, 1);
      ctx.fillStyle = f.col;
      ctx.fillRect(f.x - f.size / 2, f.y - f.size / 2, f.size, f.size);
    }
    ctx.globalAlpha = 1;
    // words
    for (const t of G.texts) {
      ctx.globalAlpha = clamp(t.life * 2, 0, 1);
      ctx.font = `800 ${t.size}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(20,30,52,0.75)";
      ctx.strokeText(t.s, t.x, t.y);
      ctx.fillStyle = t.col;
      ctx.fillText(t.s, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  function drawCalls() {
    const c = G.calls[G.calls.length - 1];
    if (!c) return;
    const a = clamp(c.life * 2.2, 0, 1);
    const y = H * 0.3;
    ctx.globalAlpha = a * (c.size < 1 ? 0.85 : 1);
    ctx.textAlign = "center";
    const big = Math.round(clamp(W * 0.1, 30, 52) * c.size);
    ctx.font = `800 ${big}px Fraunces, ui-serif, Georgia, serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(20,30,52,0.7)";
    const lift = (1 - a) * 12;
    ctx.strokeText(c.s, W / 2, y - lift);
    ctx.fillStyle = c.col;
    ctx.fillText(c.s, W / 2, y - lift);
    if (c.sub) {
      ctx.font = `600 ${Math.round(big * 0.38)}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeText(c.sub, W / 2, y + big * 0.55 - lift);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(c.sub, W / 2, y + big * 0.55 - lift);
    }
    ctx.globalAlpha = 1;
  }

  // the night sky you made: every star you lit appears, one by one, while the score counts up
  function drawNightSky() {
    const topY = H * 0.07;
    const bottom = H * 0.56;
    const n = G.litLog.length;
    const r = rng(G.seed ^ 77);
    const vt = performance.now() / 1000;
    const k = G.cardShown ? 1 : clamp(G.endT / 1.3, 0, 1);
    const showN = Math.floor(n * k);
    if (showN > G.shown) {
      if (showN - G.shown < 4 && G.shown % 2 === 0) Sound.spark(G.shown % 15);
      G.shown = showN;
    }
    for (let i = 0; i < showN; i++) {
      const s = G.litLog[i];
      const x = 16 + ((i + 0.5) / n) * (W - 32) + (r() - 0.5) * 24;
      const y = topY + clamp((s.y - TOP) / (-100 - TOP), 0, 1) * (bottom - topY - 20) + (r() - 0.5) * 16;
      const sz = (s.kind === "gold" ? 16 : 11) * (1 + 0.12 * Math.sin(vt * 3 + i));
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5;
      ctx.drawImage(glowArt("rgba(255,210,90,0.9)"), x - sz * 1.5, y - sz * 1.5, sz * 3, sz * 3);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(starArt("lit"), x - sz / 2, y - sz / 2, sz, sz);
    }
    if (!G.cardShown) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffdc6e";
      ctx.font = `600 ${Math.round(clamp(W * 0.05, 16, 22))}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText("Night falls", W / 2, H * 0.66);
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 ${Math.round(clamp(W * 0.16, 48, 84))}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.fillText(fmt(G.score * k), W / 2, H * 0.66 + clamp(W * 0.17, 52, 90));
      ctx.font = `400 ${Math.round(clamp(W * 0.037, 13, 16))}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(`${n} stars lit tonight`, W / 2, H * 0.66 + clamp(W * 0.17, 52, 90) + 34);
    }
  }

  // ---------- the HUD ----------
  const trackStops = CAST.map((c, i) => {
    const d = document.createElement("div");
    d.className = "stop";
    d.style.left = `calc(14px + (100% - 28px) * ${(i + 0.5) / 5})`;
    const k = document.createElement("canvas");
    k.width = k.height = 24;
    k.getContext("2d").drawImage(sprite(c.key, "idle", 0, i >= 3), 0, 0);
    d.appendChild(k);
    $("track").appendChild(d);
    return d;
  });
  let hudCache = "";
  function hud() {
    const best = G.best?.timeline;
    let delta = "";
    let cls = "";
    if (best && best.length) {
      const i = Math.min(best.length - 1, G.timeline.length - 1);
      if (i >= 0) {
        const d = G.score - best[i];
        delta = d >= 0 ? `+${fmt(d)} on your best` : `${fmt(-d)} behind your best`;
        cls = d >= 0 ? "up" : "down";
      }
    }
    const key = `${G.score}|${G.mult}|${G.chain}|${delta}|${G.leg}`;
    $("trackFill").style.width = `calc((100% - 28px) * ${clamp(G.t / DAY_T, 0, 1)})`;
    if (key === hudCache) return;
    hudCache = key;
    $("score").textContent = fmt(G.score);
    const dEl = $("delta");
    dEl.textContent = delta;
    dEl.className = cls;
    $("multN").textContent = `×${G.mult}`;
    const prog = G.mult >= 10 ? 1 : (G.chain % 8) / 8;
    $("ring").setAttribute("stroke-dashoffset", String(157 * (1 - prog)));
    trackStops.forEach((d, i) => {
      d.classList.toggle("on", i === G.leg);
      d.classList.toggle("done", i < G.leg);
    });
  }
  let bannerTimer = 0;
  function showBanner(k) {
    const c = CAST[k];
    const b = $("banner");
    const g = b.querySelector("canvas").getContext("2d");
    g.clearRect(0, 0, 24, 24);
    g.drawImage(sprite(c.key, "wave", 0, k >= 3), 0, 0);
    $("bannerT").textContent = `${c.name} · ${c.move}`;
    let line = c.hint;
    if (G.split) {
      const s = G.split;
      const prev = CAST[s.leg].name;
      line += `\n${prev}: ${fmt(s.score)}${s.diff == null ? "" : s.diff >= 0 ? ` (+${fmt(s.diff)} on best)` : ` (${fmt(-s.diff)} behind best)`}`;
    }
    $("bannerH").textContent = line;
    $("bannerH").style.whiteSpace = "pre-line";
    b.classList.add("show");
    bannerTimer = rounds.length >= 3 ? 2.2 : 3.2;
  }

  // ---------- the end of the day ----------
  function endRound() {
    state = "end";
    held = false;
    Sound.night();
    const perf = G.perf;
    const leg = G.legScores.slice();
    const prevBest = G.best?.score || 0;
    const isBest = G.score > prevBest;
    if (isBest) {
      store.set(G.bestKey, { score: G.score, legs: leg, timeline: G.timeline });
      if (G.mode === "today") store.set("ghost." + G.seedStr, { rec: G.rec });
    }
    const allBest = Math.max(G.allBest, G.score);
    store.set("best.all", allBest);
    const newTrails = [];
    CAST.forEach((c, i) => {
      if (leg[i] >= c.target && !unlocked.has(c.key)) {
        unlocked.add(c.key);
        newTrails.push(c);
      }
    });
    store.set("trails", [...unlocked]);
    const rec = {
      id: Date.now(),
      at: new Date().toISOString().slice(0, 16),
      mode: G.mode,
      sky: G.mode === "today" ? G.seedStr : "any",
      twist: G.mod.id,
      score: G.score,
      best: isBest,
      legs: leg,
      longestChain: G.longest,
      legFalls: G.legFalls,
      ...G.stats,
      fps: perf.frames ? Math.round(perf.frames / perf.sum) : null,
      worstFrameMs: Math.round(perf.worst),
      slowFrames: perf.slow,
      screen: `${W}x${H}`,
    };
    rounds.push(rec);
    if (rounds.length > 60) rounds = rounds.slice(-60);
    store.set("rounds", rounds);
    window.__sr.last = rec;
    $("hud").hidden = true;
    $("banner").classList.remove("show");
    buildEnd(rec, prevBest, isBest, newTrails);
    G.endT = 0;
    G.shown = 0;
    G.cardShown = false;
    if (BOT) showCard();
  }
  function showCard() {
    if (!G || G.cardShown) return;
    G.cardShown = true;
    $("end").hidden = false;
    setTimeout(() => $("againBtn")?.focus({ preventScroll: true }), 50);
  }

  function face(key, night, size = 36, pose = "idle") {
    const k = document.createElement("canvas");
    k.width = k.height = 24;
    if (size) k.style.width = k.style.height = size + "px";
    k.getContext("2d").drawImage(sprite(key, pose, 0, night), 0, 0);
    return k;
  }
  function el(tag, cls, txt) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function buildEnd(rec, prevBest, isBest, newTrails) {
    const card = $("endCard");
    card.replaceChildren();
    card.append(el("div", "eyebrow", G.mode === "today" ? `Night falls · Today's sky · ${G.mod.name}` : `Night falls · Any sky · ${G.mod.name}`));
    const tot = el("div", "total");
    tot.append(el("strong", null, fmt(rec.score)));
    if (isBest && prevBest > 0) tot.append(el("span", "chip gold", `New best, +${fmt(rec.score - prevBest)}`));
    else if (isBest) tot.append(el("span", "chip gold", "Your first best"));
    else tot.append(el("span", "chip", `Best ${fmt(prevBest)} · ${fmt(prevBest - rec.score)} to go`));
    card.append(tot);
    const legs = el("div", "legs");
    const bl = G.best?.legs;
    CAST.forEach((c, i) => {
      const row = el("div", "leg");
      row.append(face(c.key, i >= 3));
      const who = el("div", "who");
      who.append(el("b", null, `${c.name} · ${c.move}`));
      const has = unlocked.has(c.key);
      const fresh = newTrails.includes(c);
      const sm = el("small", null, fresh ? "Trail unlocked" : has ? "Trail on" : `${fmt(Math.max(0, c.target - rec.legs[i]))} more for ${c.name}'s trail`);
      who.append(sm);
      if (!has || fresh) {
        const bar = el("div", "bar");
        const fill = el("i");
        fill.style.width = `${Math.min(100, (rec.legs[i] / c.target) * 100)}%`;
        bar.append(fill);
        who.append(bar);
      }
      row.append(who);
      const pts = el("div", "pts", fmt(rec.legs[i]));
      if (bl) {
        const d = rec.legs[i] - bl[i];
        pts.append(el("small", d > 0 ? "up" : d < 0 ? "down" : "even", d > 0 ? `+${fmt(d)}` : d < 0 ? `−${fmt(-d)}` : "same"));
      }
      row.append(pts);
      legs.append(row);
    });
    card.append(legs);
    const st = el("p", "stats");
    const bits = [
      [rec.lit, "stars lit"],
      [rec.longestChain, "longest chain"],
      [rec.perfects, "perfect flings"],
      [rec.storms, "storms cleared"],
      [rec.consts, rec.consts === 1 ? "shape lit" : "shapes lit"],
      [rec.falls, rec.falls === 1 ? "splash" : "splashes"],
    ];
    bits.forEach(([n, w], i) => {
      st.append(el("b", null, String(n)), document.createTextNode(` ${w}${i < bits.length - 1 ? " · " : ""}`));
    });
    card.append(st);
    if (G.newFound.length || found.size) {
      const f = el("div", "found");
      for (const n of G.newFound) f.append(el("span", "chip gold", `New: ${n}`));
      f.append(el("span", "chip", `Shapes found: ${found.size} of ${SHAPES.length}`));
      card.append(f);
    }
    if (rounds.length === 3 || rounds.length === 8) card.append(noteBox(rec));
    const btns = el("div", "btns");
    const again = el("button", "btn", "Play again");
    again.id = "againBtn";
    again.onclick = () => play(G.mode);
    btns.append(again);
    const other = el("button", "btn ghost", G.mode === "today" ? "Try any sky" : "Play today's sky");
    other.onclick = () => play(G.mode === "today" ? "any" : "today");
    btns.append(other);
    card.append(btns);
    const links = el("div", "links");
    const home = el("button", "link", "Home");
    home.onclick = goHome;
    const note = el("button", "link", "Leave a note");
    note.onclick = () => {
      if (!card.querySelector(".note")) card.insertBefore(noteBox(rec), btns);
    };
    links.append(home, note);
    card.append(links);
  }
  function noteBox(rec) {
    const box = el("div", "note");
    box.append(el("b", null, "Quick check for tuning: did you want another go right away?"));
    const opts = el("div", "opts");
    const answers = ["Yes, right away", "A little", "Not really"];
    const area = document.createElement("textarea");
    area.id = "noteText" + rec.id;
    area.rows = 2;
    area.placeholder = "What made you feel that? (optional)";
    const saved = el("span", "tiny");
    const save = () => {
      const r = rounds.find((x) => x.id === rec.id);
      if (!r) return;
      r.wantedAnother = box.dataset.answer || null;
      r.note = area.value.trim().slice(0, 400) || null;
      store.set("rounds", rounds);
      saved.textContent = "Saved in this browser.";
    };
    for (const a of answers) {
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
  function play(mode) {
    Sound.unlock();
    newGame(mode);
    state = "play";
    held = false;
    hudCache = "";
    $("start").hidden = true;
    $("end").hidden = true;
    $("pause").hidden = true;
    $("notes").hidden = true;
    $("hud").hidden = false;
    cv.focus?.();
  }
  function pause() {
    if (state !== "play") return;
    state = "pause";
    held = false;
    $("pause").hidden = false;
    $("resumeBtn").focus({ preventScroll: true });
  }
  function resume() {
    state = "play";
    $("pause").hidden = true;
  }
  function goHome() {
    state = "menu";
    $("end").hidden = true;
    $("pause").hidden = true;
    $("hud").hidden = true;
    $("banner").classList.remove("show");
    buildStart();
    $("start").hidden = false;
  }
  function buildStart() {
    const row = $("castRow");
    row.replaceChildren();
    CAST.forEach((c, i) => {
      const f = el("figure");
      f.append(face(c.key, i >= 3, 0, "wave"));
      const cap = el("figcaption");
      cap.append(el("b", null, c.name), document.createTextNode(c.move));
      f.append(cap);
      row.append(f);
    });
    const mod = todayMod();
    const best = store.get("best.today." + todayStr(), null);
    const t = $("todayCard");
    t.replaceChildren();
    const r1 = el("div", "row");
    r1.append(el("b", null, `Today's sky · ${mod.name}`));
    if (best) r1.append(el("small", null, `Best ${fmt(best.score)}`));
    t.append(r1, el("small", null, `${mod.line} The same sky all day${best ? ", and your ghost from your best run to race." : "."}`));
    $("soundBtn").textContent = Sound.on ? "Sound on" : "Sound off";
  }
  $("playToday").onclick = () => play("today");
  $("playAny").onclick = () => play("any");
  $("soundBtn").onclick = () => {
    Sound.toggle();
    $("soundBtn").textContent = Sound.on ? "Sound on" : "Sound off";
  };
  $("pauseBtn").onclick = pause;
  $("resumeBtn").onclick = resume;
  $("restartBtn").onclick = () => play(G.mode);
  $("homeBtn").onclick = goHome;
  $("notesBtn").onclick = () => {
    $("logBox").textContent = rounds.length ? logText() : "No rounds yet.";
    $("copyMsg").textContent = "";
    $("notes").hidden = false;
  };
  $("closeNotes").onclick = () => ($("notes").hidden = true);
  function logText() {
    const head = `Sky Relay rounds (${rounds.length}), newest last. Shapes found: ${found.size}/${SHAPES.length}. Trails: ${[...unlocked].join(", ") || "none"}.`;
    const lines = rounds.map(
      (r) =>
        `${r.at} ${r.mode}/${r.twist} score ${r.score}${r.best ? " (best)" : ""} legs ${r.legs.join("/")} chain ${r.longestChain} lit ${r.lit} perfect ${r.perfects} storms ${r.storms} shapes ${r.consts} splashes ${r.falls} zaps ${r.zaps} fps ${r.fps} worst ${r.worstFrameMs}ms${r.wantedAnother ? ` | another go: ${r.wantedAnother}` : ""}${r.note ? ` | "${r.note}"` : ""}`,
    );
    return [head, ...lines].join("\n");
  }
  $("copyBtn").onclick = async () => {
    const txt = logText();
    try {
      await navigator.clipboard.writeText(txt);
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
      if (G.t > 0.5 && raw < 1) {
        G.perf.frames++;
        G.perf.sum += raw;
        G.perf.worst = Math.max(G.perf.worst, raw * 1000);
        if (raw > 1 / 40) G.perf.slow++;
      }
      acc += dt * SPEED;
      while (acc >= STEP && state === "play") {
        acc -= STEP;
        if (BOT) bot();
        let k = 1;
        if (G.slow > 0) {
          G.slow -= STEP;
          k = 0.35;
        }
        step(STEP * k);
      }
      if (state === "play") {
        const p = G.p;
        const look = G.leg === 3 ? 0.24 : 0.3;
        const want = p.x - VW * look + clamp(p.vx, -300, 900) * 0.12;
        G.camX = lerp(G.camX, want, Math.min(1, dt * 4));
        if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 40);
        for (const f of G.fx) {
          f.life -= dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.vy += f.grav * dt;
        }
        G.fx = G.fx.filter((f) => f.life > 0);
        for (const t of G.texts) {
          t.life -= dt;
          t.y -= 50 * dt;
        }
        G.texts = G.texts.filter((t) => t.life > 0);
        for (const c of G.calls) c.life -= dt;
        G.calls = G.calls.filter((c) => c.life > 0);
        if (bannerTimer > 0) {
          bannerTimer -= dt;
          if (bannerTimer <= 0) $("banner").classList.remove("show");
        }
        hud();
      }
    } else acc = 0;
    if (state === "end" && !G.cardShown) {
      G.endT += dt;
      if (G.endT > 1.9) showCard();
    }
    render(dt);
  }
  window.__sr = {
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
