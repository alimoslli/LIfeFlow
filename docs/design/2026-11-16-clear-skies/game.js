/* Clear Skies (prototype, round 2, 2026-11-16). A still night sky on a 7 x 7 grid, played with the arrow keys. Twinkle
   slides until a cloud or the edge stops it, lighting every star it passes; a row or column of lit stars clears and
   blows away the clouds touching it; a storm cloud lands after each move where a dashed outline showed. Eight nights to
   win, each with a goal and one new thing (shooting stars, golden stars, winds, a kite to trace), then Endless.
   Twinkle, the stars and the clouds are drawn by the app's own code (window.Skylings, bundled by build.mjs). */
(() => {
  "use strict";
  const SK = window.Skylings;
  const TWINKLE = SK.COMPANIONS.find((c) => c.key === "star");
  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const BOT = Q.has("bot");
  const HUMAN = Q.get("bot") === "human";
  const DEBUG = Q.has("debug");
  const RM = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const TOUCH = !!window.matchMedia?.("(pointer: coarse)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const TAU = Math.PI * 2;
  const SPEED = clamp(Number(Q.get("speed")) || 1, 1, 60);

  // ---------- tuning ----------
  const N = 7; // the board is N x N
  const SLIDE = 30; // cells a second: quick, so play keeps its pace
  const CLEAR_T = 0.3; // seconds a clear takes to play out
  const REFILL = 6; // empty sky cells that get a new star after each move
  const LINE_PTS = 10; // a clear is worth this x lines x lines, more on a streak
  const METER = 6; // lines and golden stars fill this much for a shooting star
  const MAX_CHARGES = 3;
  const WORDS = ["", "Clear!", "Double!", "Triple!", "Sky burst!"];
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const DIR_KEYS = Object.keys(DIRS);
  const at = (c, r) => r * N + c;

  // the kite traced on Night 5 (cells), and the lines between them
  const KITE = [at(3, 1), at(2, 2), at(4, 2), at(1, 3), at(5, 3), at(2, 4), at(4, 4), at(3, 5), at(3, 6)];
  const KITE_EDGES = [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 5],
    [4, 6],
    [5, 7],
    [6, 7],
    [7, 8],
  ];
  const one = () => 1;
  // each night: a goal, par moves for three moons, and one new thing
  const NIGHTS = [
    { name: "First light", goal: ["lines", 3], par: 9, startClouds: 2, clouds: (m) => (m < 2 ? 0 : 1), tip: "Light a whole row or column to clear it" },
    {
      name: "Shooting star",
      goal: ["lines", 5],
      par: 14,
      startClouds: 4,
      clouds: one,
      charges: 1,
      tip: "Boxed in? Space, then an arrow: blast through the clouds",
    },
    {
      name: "Golden stars",
      goal: ["score", 260],
      par: 16,
      startClouds: 3,
      clouds: one,
      charges: 1,
      gold: 3,
      tip: "Golden stars are worth more and charge a shooting star",
    },
    { name: "Winds", goal: ["lines", 6], par: 18, startClouds: 2, clouds: one, charges: 1, winds: 4, tip: "A wind turns Twinkle the way it blows" },
    {
      name: "The Kite",
      goal: ["shape"],
      par: 19,
      startClouds: 3,
      clouds: one,
      charges: 1,
      winds: 2,
      gold: 2,
      shape: KITE,
      tip: "Light every star of the kite",
    },
    {
      name: "Storm front",
      goal: ["blown", 10],
      par: 20,
      startClouds: 6,
      clouds: (m, r) => 1 + (r() < 0.45 ? 1 : 0),
      charges: 2,
      tip: "Clear lines next to clouds to blow them away",
    },
    {
      name: "Double night",
      goal: ["doubles", 1],
      par: 4,
      limit: 30,
      startClouds: 2,
      clouds: one,
      charges: 1,
      gold: 2,
      setup: "double",
      tip: "A row and a column are one star short. Slide through the star they share",
    },
    {
      name: "The long night",
      goal: ["lines", 12],
      par: 34,
      startClouds: 4,
      clouds: (m, r) => 1 + (r() < clamp((m - 10) / 60, 0, 0.7) ? 1 : 0),
      charges: 1,
      winds: 3,
      gold: 3,
      tip: "Everything at once",
    },
  ];
  const ENDLESS = {
    name: "Endless",
    goal: null,
    startClouds: 3,
    clouds: (m, r) => 1 + (r() < clamp((m - 25) / 110, 0, 0.8) ? 1 : 0) + (r() < clamp((m - 110) / 160, 0, 0.5) ? 1 : 0),
    charges: 1,
    winds: 3,
    gold: 3,
    tip: "Every night's tricks, for your best score",
  };

  // ---------- this browser only ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("clearskies." + k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("clearskies." + k, JSON.stringify(v));
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
    dim: { k: "#4d5f80", y: "#dfe7f5" },
    lit: { k: "#5a3d10", y: "#ffdc6e" },
    gold: { k: "#7a4a12", y: "#ffb43c" },
    goldLit: { k: "#7a3a08", y: "#ffe9a0" },
  };
  const starArt = (st) => art("star" + st, SK.STAR_ICON, STAR_PAL[st]);
  const stormArt = () => art("storm", SK.cloud(22), { X: "#3a4157", S: "#232838" });
  const ghostArt = () => art("ghost", SK.cloud(22), { X: "#c9d6ee", S: "#9fb0d0" });
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
      slide: () => noise(0.12, { vol: 0.05, freq: 1500, sweep: 1.8 }),
      star: (k, gold) => {
        tone(note(Math.min(2 + k, 14)), 0.35, { vol: 0.15 });
        tone(note(Math.min(2 + k, 14)) * (gold ? 3 : 2), 0.14, { vol: gold ? 0.07 : 0.03 });
      },
      stop: () => tone(170, 0.1, { vol: 0.09, slide: 1.5 }),
      bump: () => tone(150, 0.09, { type: "triangle", vol: 0.08, slide: 0.7 }),
      wind: () => noise(0.18, { vol: 0.05, freq: 600, sweep: 2.5 }),
      clear: (n) => {
        [0, 4, 7, 12, 16, 19].slice(0, 2 + n).forEach((s, i) => tone(523.25 * 2 ** (s / 12), 0.5, { type: "triangle", vol: 0.1, at: i * 0.05 }));
        noise(0.35, { vol: 0.05, freq: 3000, at: 0.04 });
      },
      puff: () => noise(0.2, { vol: 0.05, freq: 500, type: "lowpass" }),
      charge: () => [0, 7, 12].forEach((s, i) => tone(784 * 2 ** (s / 12), 0.25, { type: "triangle", vol: 0.09, at: i * 0.05 })),
      arm: () => tone(880, 0.2, { type: "triangle", vol: 0.08, slide: 1.5 }),
      dash: () => {
        noise(0.45, { vol: 0.12, freq: 800, sweep: 4 });
        tone(392, 0.4, { type: "sawtooth", vol: 0.04, slide: 3 });
      },
      win: () => [0, 4, 7, 12, 16].forEach((s, i) => tone(523.25 * 2 ** (s / 12), 0.6, { type: "triangle", vol: 0.11, at: i * 0.09 })),
      best: () => [0, 2, 4, 7, 9, 12].forEach((s, i) => tone(note(5 + i), 0.3, { type: "triangle", vol: 0.1, at: i * 0.06 })),
      night: () => [0, 7, 16].forEach((s, i) => tone(196 * 2 ** (s / 12), 2, { vol: 0.06, attack: 0.4, at: i * 0.15 })),
    };
  })();
  const buzz = (ms) => {
    try {
      navigator.vibrate?.(ms);
    } catch {}
  };

  // ---------- screen: the board sits still in the middle ----------
  const cv = $("c");
  const ctx = cv.getContext("2d");
  let W = 0;
  let H = 0;
  let DPR = 1;
  const B = { x: 0, y: 0, cell: 40, size: 280 };
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = Math.round(W * DPR);
    cv.height = Math.round(H * DPR);
    const top = 120;
    const bottom = TOUCH ? 168 : 92;
    const size = clamp(Math.min(W - 32, H - top - bottom), 238, 574);
    B.cell = Math.floor(size / N);
    B.size = B.cell * N;
    B.x = Math.round((W - B.size) / 2);
    B.y = Math.round(top + Math.max(0, (H - top - bottom - B.size) / 2));
  }
  window.addEventListener("resize", resize);
  resize();
  const cx = (c) => B.x + (c + 0.5) * B.cell;
  const cy = (r) => B.y + (r + 0.5) * B.cell;

  // ---------- progress and a run ----------
  let state = "menu"; // menu | play | pause | won | over | end
  let G = null;
  let runs = store.get("runs", []);
  const seen = new Set(store.get("hints", []));
  const progress = store.get("progress", { unlocked: 1, moons: [] });
  const endlessOpen = () => progress.unlocked > 3;

  function newRun(mode, night) {
    const cfg = mode === "endless" ? ENDLESS : NIGHTS[night];
    const seed = Number(Q.get("seed")) || (Math.random() * 2 ** 31) | 0;
    G = {
      mode,
      night,
      cfg,
      R: rng(seed),
      board: Array.from({ length: N * N }, () => ({ t: "star", lit: false, gold: false, born: -1 })),
      wind: Array(N * N).fill(null),
      shape: new Set(cfg.shape || []),
      shapeDone: new Set(),
      avoid: new Set(),
      tw: { c: 3, r: 3, x: 3, y: 3 },
      score: 0,
      best: store.get("best", 0),
      passedBest: false,
      moves: 0,
      streak: 0,
      charges: cfg.charges || 0,
      meter: 0,
      armed: false,
      forecast: [],
      anim: null,
      queue: [],
      started: false,
      clock: 0,
      vt: 0,
      squash: 0,
      bump: 0,
      bumpDir: null,
      hover: null,
      fx: [],
      texts: [],
      calls: [],
      hints: [],
      trail: [],
      endT: 0,
      botT: 0.8,
      boxedTold: false,
      stats: {
        moves: 0,
        lines: 0,
        doubles: 0,
        triples: 0,
        bursts: 0,
        clearSkies: 0,
        bestCombo: 0,
        longest: 0,
        bumps: 0,
        blown: 0,
        gold: 0,
        dashes: 0,
        winds: 0,
      },
      perf: { frames: 0, sum: 0, worst: 0, slow: 0 },
    };
    G.board[at(3, 3)].lit = true;
    // winds: away from the middle row and column, never pointing straight off the board
    for (let k = 0; k < (cfg.winds || 0); k++)
      for (let tries = 0; tries < 30; tries++) {
        const i = (G.R() * N * N) | 0;
        const c = i % N;
        const r = (i / N) | 0;
        if (c === 3 || r === 3 || G.wind[i] || G.shape.has(i)) continue;
        const ok = DIR_KEYS.filter((d) => {
          const [dc, dr] = DIRS[d];
          return c + dc >= 0 && c + dc < N && r + dr >= 0 && r + dr < N;
        });
        G.wind[i] = ok[(G.R() * ok.length) | 0];
        break;
      }
    if (cfg.setup === "double") {
      for (let k = 0; k < N; k++) {
        G.board[at(k, 1)].lit = true;
        G.board[at(5, k)].lit = true;
        G.avoid.add(at(k, 1)).add(at(5, k)).add(at(3, k));
      }
      G.board[at(5, 1)].lit = false;
      G.board[at(3, 0)].t = "cloud";
    }
    for (const i of pickCloudSpots(cfg.startClouds, true)) G.board[i].t = "cloud";
    for (let k = 0; k < (cfg.gold || 0); k++) {
      const stars = [];
      for (let i = 0; i < N * N; i++) if (G.board[i].t === "star" && !G.board[i].lit && !G.board[i].gold) stars.push(i);
      if (stars.length) G.board[stars[(G.R() * stars.length) | 0]].gold = true;
    }
    G.forecast = pickCloudSpots(cfg.clouds(0, G.R));
  }

  // where clouds land: on stars, empty sky or a wind (it blows again once the cloud goes), never on Twinkle or the kite,
  // mostly on unlit stars, rarely next to Twinkle
  function pickCloudSpots(k, start = false) {
    const R = G.R;
    const tw = G.tw;
    const out = [];
    for (let n = 0; n < k; n++) {
      const cand = [];
      for (let i = 0; i < N * N; i++) {
        const cell = G.board[i];
        const c = i % N;
        const r = (i / N) | 0;
        if (cell.t === "cloud" || (c === tw.c && r === tw.r) || out.includes(i) || G.shape.has(i) || (start && G.wind[i])) continue;
        const near = Math.abs(c - tw.c) + Math.abs(r - tw.r) === 1;
        // the opening clouds stay out of Twinkle's row and column, so the second move can clear the first line
        if (start && (c === tw.c || r === tw.r || G.avoid.has(i))) continue;
        if (G.moves < 3 && G.avoid.has(i)) continue;
        cand.push([i, (cell.lit ? 0.4 : 1) * (near ? 0.35 : 1)]);
      }
      const total = cand.reduce((a, [, w]) => a + w, 0);
      let pick = R() * total;
      for (const [i, w] of cand) {
        pick -= w;
        if (pick <= 0) {
          out.push(i);
          break;
        }
      }
    }
    return out;
  }

  // the cells Twinkle passes going this way: it stops at a cloud or the edge, and a wind turns it.
  // A shooting star goes straight to the edge, through the clouds.
  function pathFor(board, wind, c, r, dir, dash = false) {
    let d = dir;
    const path = [];
    const seenStep = new Set();
    for (let k = 0; k < 64; k++) {
      const [dc, dr] = DIRS[d];
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= N || nr < 0 || nr >= N) break;
      const j = at(nc, nr);
      if (board[j].t === "cloud" && !dash) break;
      if (seenStep.has(j + d)) break;
      seenStep.add(j + d);
      c = nc;
      r = nr;
      path.push(j);
      if (!dash && wind[j]) d = wind[j];
    }
    return path;
  }
  // every row and column that is all lit stars (a cloud or empty sky in it blocks the clear)
  function fullLines(board) {
    const out = [];
    for (let k = 0; k < N; k++) {
      const row = Array.from({ length: N }, (_, c) => at(c, k));
      const col = Array.from({ length: N }, (_, r) => at(k, r));
      for (const idx of [row, col]) if (idx.every((i) => board[i].t === "star" && board[i].lit)) out.push(idx);
    }
    return out;
  }
  // the clouds touching a cleared line are blown away with it
  function blownBy(board, cells) {
    const out = new Set();
    for (const i of cells) {
      const c = i % N;
      const r = (i / N) | 0;
      for (const [dc, dr] of Object.values(DIRS)) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nc >= N || nr < 0 || nr >= N) continue;
        const j = at(nc, nr);
        if (board[j].t === "cloud" && !cells.has(j)) out.add(j);
      }
    }
    return out;
  }
  const movesFrom = (board, wind, c, r) => DIR_KEYS.filter((d) => pathFor(board, wind, c, r, d).length);

  // ---------- goals ----------
  function goalNow() {
    const g = G.cfg.goal;
    if (!g) return null;
    const [kind, n] = g;
    if (kind === "lines") return { have: G.stats.lines, need: n, text: `Clear ${n} lines` };
    if (kind === "score") return { have: G.score, need: n, text: `Reach ${n} points` };
    if (kind === "blown") return { have: G.stats.blown, need: n, text: `Blow away ${n} clouds` };
    if (kind === "doubles") return { have: G.stats.doubles + G.stats.triples + G.stats.bursts, need: n, text: n === 1 ? "Make a Double" : `Make ${n} Doubles` };
    return { have: G.shapeDone.size, need: G.shape.size, text: "Light the kite" };
  }
  function hud() {
    const g = goalNow();
    const el = $("goal");
    el.textContent = "";
    if (!g)
      el.append(document.createTextNode("Endless "), Object.assign(document.createElement("small"), { textContent: G.best ? `· best ${fmt(G.best)}` : "" }));
    else {
      const left = limitOf(G.cfg) - G.moves;
      el.append(
        document.createTextNode(`Night ${G.night + 1} · ${g.text} `),
        Object.assign(document.createElement("small"), { textContent: `${Math.min(g.have, g.need)}/${g.need} · ${left} moves left` }),
      );
    }
    $("starN").textContent = String(G.charges);
    $("starBtn").classList.toggle("armed", G.armed);
    $("starBtn").disabled = !G.charges;
  }

  // ---------- the move ----------
  function tryMove(dir) {
    if (state !== "play") return;
    Sound.unlock();
    if (G.anim) {
      if (G.queue.length < 2) G.queue.push(dir);
      return;
    }
    const dash = G.armed;
    const path = pathFor(G.board, G.wind, G.tw.c, G.tw.r, dir, dash);
    if (!path.length) {
      G.bump = 0.25;
      G.bumpDir = dir;
      G.stats.bumps++;
      Sound.bump();
      return;
    }
    if (dash) {
      G.armed = false;
      G.charges--;
      G.stats.dashes++;
      Sound.dash();
      buzz(20);
    } else Sound.slide();
    G.anim = { kind: "slide", path, pts: [at(G.tw.c, G.tw.r), ...path], dash, i: 0, pos: 0, lit: 0 };
    G.moves++;
    G.stats.moves++;
    G.started = true;
    hud();
  }
  function arm() {
    if (state !== "play" || !G.charges) return;
    Sound.unlock();
    G.armed = !G.armed;
    if (G.armed) Sound.arm();
    hud();
  }
  function addMeter(n) {
    G.meter += n;
    while (G.meter >= METER) {
      G.meter -= METER;
      gainCharge(true);
    }
  }
  function gainCharge(tell) {
    if (G.charges >= MAX_CHARGES) return;
    G.charges++;
    Sound.charge();
    text(B.x + B.cell * 0.9, B.y - 18, "+1 shooting star", "#ffdc6e", 16);
    if (tell && !seen.has("charge")) {
      seen.add("charge");
      if (!BOT) store.set("hints", [...seen]);
      call("Shooting star!", "Space, then an arrow: blast through clouds", "#ffdc6e", 0.8);
    }
    hud();
  }
  function animate(dt) {
    const a = G.anim;
    if (!a) return;
    if (a.kind === "slide") {
      a.pos = Math.min(a.path.length, a.pos + (a.dash ? SLIDE * 1.3 : SLIDE) * dt);
      while (a.i < a.path.length && a.pos >= a.i + 0.6) {
        const idx = a.path[a.i];
        const cell = G.board[idx];
        const c = idx % N;
        const r = (idx / N) | 0;
        if (a.dash && cell.t === "cloud") {
          // a shooting star blows the cloud away
          G.board[idx] = { t: "sky", lit: false, gold: false, born: G.vt };
          G.stats.blown++;
          G.score += 8;
          bumpScore();
          burst(cx(c), cy(r), "#cfd8ee", 10, B.cell * 5, B.cell * 0.12);
          text(cx(c), cy(r) - B.cell * 0.45, "+8", "#cfe0ff", 16);
        } else if (cell.t === "star" && !cell.lit) {
          cell.lit = true;
          a.lit++;
          const pts = a.lit + (cell.gold ? 5 : 0);
          G.score += pts;
          bumpScore();
          if (G.shape.has(idx)) G.shapeDone.add(idx);
          if (cell.gold) {
            G.stats.gold++;
            addMeter(2);
          }
          text(cx(c), cy(r) - B.cell * 0.45, `+${pts}`, cell.gold || a.lit >= 4 ? "#ffdc6e" : "#ffffff", 14 + Math.min(a.lit, 6) * 2);
          burst(cx(c), cy(r), cell.gold ? "#ffb43c" : "#ffdc6e", cell.gold ? 14 : 7, B.cell * 3, B.cell * 0.09);
          Sound.star(a.lit, cell.gold);
        }
        if (!a.dash && G.wind[idx] && a.i < a.path.length - 1) {
          G.stats.winds++;
          Sound.wind();
        }
        a.i++;
      }
      // Twinkle's place along the path, turning where a wind turned it
      const k = Math.min(Math.floor(a.pos), a.pts.length - 2);
      const f = a.pos - k;
      const p0 = a.pts[k];
      const p1 = a.pts[k + 1];
      G.tw.x = (p0 % N) + ((p1 % N) - (p0 % N)) * f;
      G.tw.y = ((p0 / N) | 0) + (((p1 / N) | 0) - ((p0 / N) | 0)) * f;
      if (a.dash) G.trail.push({ x: cx(G.tw.x), y: cy(G.tw.y), life: 0.35 });
      if (a.pos >= a.path.length) {
        const last = a.path[a.path.length - 1];
        G.tw.c = last % N;
        G.tw.r = (last / N) | 0;
        G.tw.x = G.tw.c;
        G.tw.y = G.tw.r;
        G.squash = 1;
        G.stats.longest = Math.max(G.stats.longest, a.lit);
        Sound.stop();
        if (a.lit >= 6) call(a.lit >= 8 ? "Comet!" : "Long slide!", `${a.lit} stars in one slide`, "#ffdc6e", 0.75);
        settle();
      }
    } else if (a.kind === "clear") {
      a.t += dt;
      if (a.t >= CLEAR_T) finishClear(a);
    }
  }
  function settle() {
    const lines = fullLines(G.board);
    if (!lines.length) {
      G.streak = 0;
      G.anim = null;
      return endTurn();
    }
    const n = lines.length;
    G.streak++;
    const mult = Math.min(3, 1 + 0.5 * (G.streak - 1));
    const pts = Math.round(LINE_PTS * n * n * mult);
    G.score += pts;
    bumpScore();
    G.stats.lines += n;
    G.stats.bestCombo = Math.max(G.stats.bestCombo, n);
    if (n === 2) G.stats.doubles++;
    if (n === 3) G.stats.triples++;
    if (n >= 4) G.stats.bursts++;
    call(WORDS[Math.min(n, 4)], G.streak > 1 ? `+${pts} · streak ${G.streak}` : `+${pts}`, "#ffdc6e", 1);
    Sound.clear(n);
    buzz(12 + n * 8);
    const cells = new Set(lines.flat());
    const blown = blownBy(G.board, cells);
    for (const i of cells) burst(cx(i % N), cy((i / N) | 0), "#fff3c4", 6, B.cell * 4, B.cell * 0.1);
    for (const i of blown) burst(cx(i % N), cy((i / N) | 0), "#cfd8ee", 10, B.cell * 5, B.cell * 0.12);
    G.stats.blown += blown.size;
    addMeter(n);
    if (n >= 2) gainCharge(false);
    G.anim = { kind: "clear", t: 0, cells, blown };
    checkBest();
  }
  function finishClear(a) {
    // the lit stars rise into the sky and leave the night empty there; new stars come back a few at a time
    for (const i of [...a.cells, ...a.blown]) G.board[i] = { t: "sky", lit: false, gold: false, born: G.vt };
    G.forecast = G.forecast.filter((i) => !a.cells.has(i) && !a.blown.has(i));
    if (!G.board.some((x) => x.t === "cloud")) {
      G.stats.clearSkies++;
      G.score += 50;
      bumpScore();
      call("Clear skies!", "+50 · not a cloud left", "#86d3a0", 1);
      Sound.best();
    }
    G.anim = null;
    endTurn();
  }
  function endTurn() {
    hud();
    // a night is won the moment its goal is met
    const goal = goalNow();
    if (goal && goal.have >= goal.need) return win();
    // the forecast clouds land; one that finds Twinkle in its spot drifts to another
    const landing = [];
    for (const i of G.forecast) {
      if (i !== at(G.tw.c, G.tw.r) && G.board[i].t !== "cloud" && !landing.includes(i)) landing.push(i);
      else {
        const alt = pickCloudSpots(1).find((j) => !landing.includes(j));
        if (alt != null) landing.push(alt);
      }
    }
    // early on, a cloud never lands where it would box Twinkle in
    if (G.moves < 12)
      for (let k = 0; k < landing.length; k++) {
        const b = G.board.map((x, j) => (landing.includes(j) ? { t: "cloud" } : x));
        if (movesFrom(b, G.wind, G.tw.c, G.tw.r).length) break;
        landing.splice(k--, 1);
      }
    for (const i of landing) {
      G.board[i] = { t: "cloud", lit: false, gold: false, born: G.vt };
      burst(cx(i % N), cy((i / N) | 0), "#9fb0d0", 6, B.cell * 2, B.cell * 0.08);
    }
    if (landing.length) Sound.puff();
    // new stars in a few empty spots (the kite's first), now and then a golden one
    const empty = [];
    for (let i = 0; i < N * N; i++) if (G.board[i].t === "sky" && i !== at(G.tw.c, G.tw.r)) empty.push(i);
    const kiteFirst = empty.filter((i) => G.shape.has(i));
    const rest = empty.filter((i) => !G.shape.has(i));
    for (let k = 0; k < REFILL && (kiteFirst.length || rest.length); k++) {
      const i = kiteFirst.length ? kiteFirst.shift() : rest.splice((G.R() * rest.length) | 0, 1)[0];
      G.board[i] = { t: "star", lit: false, gold: !!G.cfg.gold && G.R() < 0.1, born: G.vt };
    }
    G.forecast = pickCloudSpots(G.cfg.clouds(G.moves, G.R));
    if (G.moves >= limitOf(G.cfg)) return over("morning");
    const free = movesFrom(G.board, G.wind, G.tw.c, G.tw.r).length;
    if (!free && !G.charges) return over();
    if (!free && !G.boxedTold) {
      G.boxedTold = true;
      call("Boxed in!", "Space, then an arrow: use a shooting star", "#ffc1b4", 0.85);
    }
    if (BOT && G.moves >= (Number(Q.get("cap")) || 1e9)) return over();
    hints();
    if (G.queue.length) tryMove(G.queue.shift());
  }
  function checkBest() {
    if (G.mode !== "endless" || G.passedBest || G.best <= 0 || G.score <= G.best) return;
    G.passedBest = true;
    setTimeout(() => {
      if (state === "play") {
        call("New best!", "Keep going", "#86d3a0", 1);
        Sound.best();
      }
    }, 450);
  }

  // ---------- hints, once per device, one at a time ----------
  function hint(id) {
    if (seen.has(id) || G.hints.length) return;
    G.hints.push({ id, life: id === "move" ? 999 : 3.4 });
    seen.add(id);
    if (!BOT) store.set("hints", [...seen]);
  }
  function hints() {
    if (G.moves >= 2) hint("next");
    if (G.moves >= 4 && G.board.some((x) => x.t === "cloud")) hint("cloud");
  }

  // ---------- feedback (screen pixels) ----------
  function burst(x, y, col, n, sp, size = 4) {
    if (G.fx.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = sp * (0.3 + Math.random() * 0.7);
      G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.3, max: 0.75, size: size * (0.6 + Math.random() * 0.8), col });
    }
  }
  function text(x, y, s, col, size) {
    G.texts.push({ x, y, s, col, size, life: 0.8 });
  }
  function call(s, sub, col, size, life = 1.4, top = false) {
    G.calls.push({ s, sub, col, size, life, top });
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

  // ---------- input: the arrow keys (WASD too), Space for a shooting star; swipes and the pad on a phone ----------
  const KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down" };
  window.addEventListener("keydown", (e) => {
    const d = KEYS[e.code];
    if (state === "play") {
      if (d) {
        e.preventDefault();
        if (!e.repeat) tryMove(d);
      } else if (e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) arm();
      } else if (e.code === "Escape" || e.code === "KeyP") pause();
      return;
    }
    if (document.activeElement?.tagName === "TEXTAREA") return;
    if ((e.code === "Enter" || e.code === "Space") && state === "end") {
      e.preventDefault();
      $("againBtn")?.click();
    }
    if (e.code === "KeyR" && (state === "end" || state === "pause")) {
      e.preventDefault();
      play(G.mode, G.night);
    }
    if (e.code === "Escape" && state === "pause") resume();
  });
  function dirToward(x, y) {
    const dx = x - cx(G.tw.c);
    const dy = y - cy(G.tw.r);
    if (Math.max(Math.abs(dx), Math.abs(dy)) < B.cell * 0.5) return null;
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
  }
  let press = null;
  cv.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (state !== "play") return;
    Sound.unlock();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY };
  });
  cv.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.id || state !== "play") return;
    const dx = e.clientX - press.x;
    const dy = e.clientY - press.y;
    press = null;
    if (Math.hypot(dx, dy) > 24) tryMove(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down");
    else {
      const d = dirToward(e.clientX, e.clientY);
      if (d) tryMove(d);
    }
  });
  cv.addEventListener("pointercancel", () => (press = null));
  cv.addEventListener("pointermove", (e) => {
    if (state !== "play" || e.pointerType !== "mouse") return;
    const inBoard = e.clientX > B.x - B.cell && e.clientX < B.x + B.size + B.cell && e.clientY > B.y - B.cell && e.clientY < B.y + B.size + B.cell;
    G.hover = inBoard ? dirToward(e.clientX, e.clientY) : null;
  });
  cv.addEventListener("pointerleave", () => G && (G.hover = null));
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  for (const b of document.querySelectorAll(".dpad button"))
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      tryMove(b.dataset.dir);
    });
  $("starBtn").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    arm();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "play") pause();
  });

  // ---------- the bot (?bot=1 thinks two moves ahead, ?bot=human one move and slips now and then) ----------
  function sim(board, tw, dir, forecast) {
    const path = pathFor(board, G.wind, tw.c, tw.r, dir);
    if (!path.length) return null;
    const b = board.map((x) => ({ ...x }));
    let pts = 0;
    let k = 0;
    let shape = 0;
    for (const i of path)
      if (b[i].t === "star" && !b[i].lit) {
        b[i].lit = true;
        pts += ++k + (b[i].gold ? 5 : 0);
        if (G.shape.has(i) && !G.shapeDone.has(i)) shape++;
      }
    const last = path[path.length - 1];
    const nt = { c: last % N, r: (last / N) | 0 };
    const lines = fullLines(b);
    const cells = new Set(lines.flat());
    const blown = blownBy(b, cells);
    for (const i of [...cells, ...blown]) b[i] = { t: "sky", lit: false };
    for (const i of forecast) if (i !== last && b[i].t !== "cloud" && !cells.has(i) && !blown.has(i)) b[i] = { t: "cloud", lit: false };
    pts += LINE_PTS * lines.length * lines.length + blown.size * 12 + shape * 30;
    const mob = movesFrom(b, G.wind, nt.c, nt.r).length;
    const clouds = b.filter((x) => x.t === "cloud").length;
    let near = 0;
    for (let q = 0; q < N; q++)
      for (const idx of [Array.from({ length: N }, (_, c) => at(c, q)), Array.from({ length: N }, (_, r) => at(q, r))])
        if (idx.every((i) => b[i].t === "star")) near += idx.filter((i) => b[i].lit).length;
    return { b, nt, value: pts + lines.length * 40 + mob * 14 - clouds * 5 + near * 2 - (mob === 0 ? 2000 : mob === 1 ? 60 : 0) };
  }
  function botChoose() {
    let best = null;
    for (const d of DIR_KEYS) {
      const r = sim(G.board, G.tw, d, G.forecast);
      if (!r) continue;
      let v = r.value;
      if (!HUMAN) {
        let second = -2000;
        for (const d2 of DIR_KEYS) {
          const r2 = sim(r.b, r.nt, d2, []);
          if (r2) second = Math.max(second, r2.value);
        }
        v += 0.5 * second;
      }
      if (!best || v > best.v) best = { d, v };
    }
    if (HUMAN && Math.random() < 0.2) {
      const ok = movesFrom(G.board, G.wind, G.tw.c, G.tw.r);
      if (ok.length) return ok[(Math.random() * ok.length) | 0];
    }
    return best && best.v > -1500 ? best.d : null;
  }
  function bot(dt) {
    if (G.anim) return;
    G.botT -= dt;
    if (G.botT > 0) return;
    G.botT = HUMAN ? 0.9 + Math.random() * 0.8 : 0.25;
    const d = botChoose();
    if (d) return tryMove(d);
    // boxed in, or every move walks into a box: use a shooting star toward the longest dash
    if (G.charges) {
      const dash = DIR_KEYS.map((x) => [x, pathFor(G.board, G.wind, G.tw.c, G.tw.r, x, true).length]).sort((p, q) => q[1] - p[1])[0];
      if (dash && dash[1]) {
        if (!G.armed) arm();
        return tryMove(dash[0]);
      }
    }
    const any = movesFrom(G.board, G.wind, G.tw.c, G.tw.r)[0];
    if (any) tryMove(any);
  }

  // ---------- drawing ----------
  const BG = Array.from({ length: 120 }, (_, i) => {
    const r = rng(i * 7919 + 3);
    return { x: r(), y: r() * 0.8, s: r() < 0.12 ? 2 : 1, ph: r() * TAU };
  });
  function render(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const vt = G ? G.vt : performance.now() / 1000;
    const sea = H - (TOUCH && state === "play" ? 30 : 64);
    const sky = ctx.createLinearGradient(0, 0, 0, sea);
    sky.addColorStop(0, "#142451");
    sky.addColorStop(0.65, "#233c6e");
    sky.addColorStop(1, "#3a5a8f");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, sea);
    for (const s of BG) {
      ctx.globalAlpha = RM ? 0.6 : 0.4 + 0.3 * Math.sin(vt * 0.9 + s.ph);
      ctx.fillStyle = "#eef3ff";
      ctx.fillRect(s.x * W, s.y * sea, s.s * 1.5, s.s * 1.5);
    }
    ctx.globalAlpha = 1;
    const mr = clamp(W * 0.05, 18, 36);
    const mx = W - mr * 2.2;
    const my = 72;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.4;
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
    ]) {
      ctx.beginPath();
      ctx.arc(mx + a * mr, my + b * mr, r * mr, 0, TAU);
      ctx.fill();
    }
    const gr = ctx.createLinearGradient(0, sea, 0, H);
    gr.addColorStop(0, "#3a5a8f");
    gr.addColorStop(1, "#14234a");
    ctx.fillStyle = gr;
    ctx.fillRect(0, sea, W, H - sea);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(0, sea - 1, W, 2);
    if (G && state !== "menu") drawBoard(vt, dt);
    if (DEBUG && G) {
      ctx.fillStyle = "#fff";
      ctx.font = "12px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`fps ${(1 / Math.max(dt, 0.001)).toFixed(0)} moves ${G.moves} clouds ${G.board.filter((x) => x.t === "cloud").length}`, 10, H - 10);
    }
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function drawWind(x, y, d, C, vt) {
    // a little drift of air and an arrow the way it blows
    const ang = Math.atan2(DIRS[d][1], DIRS[d][0]);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = "rgba(160,220,255,0.55)";
    ctx.lineWidth = Math.max(2, C * 0.05);
    const off = RM ? 0 : ((vt * 0.8) % 1) * C * 0.2;
    for (let k = -1; k <= 1; k++) {
      ctx.beginPath();
      ctx.moveTo(-C * 0.38 + off, k * C * 0.2);
      ctx.lineTo(C * 0.12 + off, k * C * 0.2);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(190,235,255,0.85)";
    ctx.beginPath();
    ctx.moveTo(C * 0.42, 0);
    ctx.lineTo(C * 0.22, -C * 0.14);
    ctx.lineTo(C * 0.22, C * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawBoard(vt, dt) {
    const g = G;
    const C = B.cell;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "rgba(8,16,38,0.42)";
    roundRect(B.x - 10, B.y - 10, B.size + 20, B.size + 20, 18);
    ctx.fill();
    ctx.strokeStyle = g.armed ? "rgba(255,220,110,0.6)" : "rgba(255,255,255,0.1)";
    ctx.lineWidth = g.armed ? 2 : 1;
    ctx.stroke();
    const clearing = g.anim && g.anim.kind === "clear" ? g.anim : null;
    // a line one star from clearing glows softly, so the next good move is easy to see
    if (!clearing)
      for (let k = 0; k < N; k++)
        for (const [idx, horiz] of [
          [Array.from({ length: N }, (_, c) => at(c, k)), true],
          [Array.from({ length: N }, (_, r) => at(k, r)), false],
        ]) {
          const left = idx.filter((i) => g.board[i].t === "star" && !g.board[i].lit).length;
          if (left !== 1 || idx.some((i) => g.board[i].t !== "star")) continue;
          ctx.fillStyle = "rgba(255,220,110,0.08)";
          if (horiz) ctx.fillRect(B.x, B.y + k * C, B.size, C);
          else ctx.fillRect(B.x + k * C, B.y, C, B.size);
        }
    // the kite
    if (g.shape.size) {
      ctx.lineWidth = 2;
      for (const [a, b] of KITE_EDGES) {
        const i = KITE[a];
        const j = KITE[b];
        const both = g.shapeDone.has(i) && g.shapeDone.has(j);
        ctx.strokeStyle = both ? "rgba(255,220,110,0.7)" : "rgba(207,224,255,0.35)";
        ctx.setLineDash(both ? [] : [4, 6]);
        ctx.beginPath();
        ctx.moveTo(cx(i % N), cy((i / N) | 0));
        ctx.lineTo(cx(j % N), cy((j / N) | 0));
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    for (let i = 0; i < N * N; i++) {
      const c = i % N;
      const r = (i / N) | 0;
      const x = cx(c);
      const y = cy(r);
      const cell = g.board[i];
      ctx.fillStyle = (c + r) % 2 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.045)";
      ctx.fillRect(B.x + c * C + 1, B.y + r * C + 1, C - 2, C - 2);
      if (g.shape.has(i)) {
        ctx.strokeStyle = g.shapeDone.has(i) ? "rgba(255,220,110,0.8)" : "rgba(207,224,255,0.45)";
        ctx.lineWidth = 2;
        ctx.strokeRect(B.x + c * C + 5, B.y + r * C + 5, C - 10, C - 10);
      }
      if (g.wind[i] && cell.t !== "cloud") drawWind(x, y, g.wind[i], C, vt);
      const grow = cell.born >= 0 ? clamp((vt - cell.born) * 5, 0, 1) : 1;
      const inClear = clearing && clearing.cells.has(i);
      const fade = inClear ? 1 - clearing.t / CLEAR_T : 1;
      if (inClear) {
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = "#fff3c4";
        ctx.fillRect(B.x + c * C, B.y + r * C, C, C);
        ctx.globalAlpha = 1;
      }
      if (cell.t === "cloud") {
        const away = clearing && clearing.blown.has(i) ? clearing.t / CLEAR_T : 0;
        const w = C * 1.08 * (0.5 + 0.5 * grow) * (1 + away * 0.6);
        ctx.globalAlpha = 1 - away;
        ctx.fillStyle = "rgba(190,210,245,0.55)";
        for (let k = 0; k < 3; k++) ctx.fillRect(x - w * 0.3 + k * w * 0.3, y + C * 0.12 + ((vt * C * 1.5 + k * 9) % (C * 0.28)), 2, C * 0.12);
        ctx.drawImage(stormArt(), x - w / 2, y - C * 0.28, w, C * 0.4);
        ctx.fillStyle = "#e7ecf8";
        const e = Math.max(2, Math.round(C * 0.06));
        ctx.fillRect(x - C * 0.17, y - C * 0.12, e, e);
        ctx.fillRect(x + C * 0.13, y - C * 0.12, e, e);
        ctx.globalAlpha = 1;
      } else if (cell.t === "star") {
        const lit = cell.lit;
        const lift = inClear ? -C * 0.5 * (clearing.t / CLEAR_T) : 0;
        const pulse = (lit || cell.gold) && !RM ? 1 + 0.06 * Math.sin(vt * 3 + i) : 1;
        const sz = C * (lit ? 0.6 : cell.gold ? 0.56 : 0.46) * grow * pulse * (inClear ? 1 + (1 - fade) * 0.4 : 1);
        if (lit || cell.gold) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = (lit ? 0.55 : 0.4) * fade;
          ctx.drawImage(glowArt(cell.gold ? "rgba(255,170,60,0.9)" : "rgba(255,210,90,0.9)"), x - sz * 1.3, y - sz * 1.3 + lift, sz * 2.6, sz * 2.6);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.globalAlpha = (lit || cell.gold ? 1 : 0.75) * fade;
        ctx.drawImage(starArt(cell.gold ? (lit ? "goldLit" : "gold") : lit ? "lit" : "dim"), x - sz / 2, y - sz / 2 + lift, sz, sz);
        ctx.globalAlpha = 1;
      }
    }
    // where the next clouds land
    if (state === "play" && !clearing)
      for (const i of g.forecast) {
        const x = cx(i % N);
        const y = cy((i / N) | 0);
        ctx.globalAlpha = 0.3 + (RM ? 0 : 0.12 * Math.sin(vt * 4));
        ctx.drawImage(ghostArt(), x - C * 0.5, y - C * 0.28, C, C * 0.36);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(207,224,255,0.5)";
        ctx.setLineDash([4, 5]);
        ctx.lineWidth = 1.5;
        ctx.strokeRect(B.x + (i % N) * C + 4, B.y + ((i / N) | 0) * C + 4, C - 8, C - 8);
        ctx.setLineDash([]);
      }
    // on a laptop, the path a click on this side would take
    if (state === "play" && g.hover && !g.anim) {
      const path = pathFor(g.board, g.wind, g.tw.c, g.tw.r, g.hover, g.armed);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (const i of path) ctx.fillRect(cx(i % N) - 3, cy((i / N) | 0) + C * 0.32, 6, 6);
    }
    // a shooting star's tail
    for (const t of g.trail) {
      t.life -= dt;
      ctx.globalAlpha = clamp(t.life * 3, 0, 1) * 0.8;
      ctx.fillStyle = "#ffe9a0";
      ctx.fillRect(t.x - C * 0.08, t.y - C * 0.08, C * 0.16, C * 0.16);
    }
    g.trail = g.trail.filter((t) => t.life > 0);
    ctx.globalAlpha = 1;
    // the ways Twinkle can go
    const moves =
      state === "play" && !g.anim
        ? g.armed
          ? DIR_KEYS.filter((d) => pathFor(g.board, g.wind, g.tw.c, g.tw.r, d, true).length)
          : movesFrom(g.board, g.wind, g.tw.c, g.tw.r)
        : [];
    const tx = B.x + (g.tw.x + 0.5) * C;
    const ty = B.y + (g.tw.y + 0.5) * C;
    const firstRun = g.hints.some((h) => h.id === "move");
    for (const d of moves) {
      const [dx, dy] = DIRS[d];
      const off = C * (0.62 + (RM ? 0 : 0.04 * Math.sin(vt * 5)));
      ctx.save();
      ctx.translate(tx + dx * off, ty + dy * off);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = g.armed ? "rgba(255,220,110,0.95)" : `rgba(255,255,255,${firstRun ? 0.85 : 0.35})`;
      ctx.beginPath();
      ctx.moveTo(C * 0.1, 0);
      ctx.lineTo(-C * 0.06, -C * 0.09);
      ctx.lineTo(-C * 0.06, C * 0.09);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Twinkle
    let pose = "idle";
    let fr = vt % 3.2 < 0.12 ? 1 : 0;
    let tilt = 0;
    if (state === "over" || (state === "end" && g.lost)) {
      pose = "sleep";
      fr = ((vt * 1.5) | 0) % 2;
    } else if (state === "won" || (state === "end" && !g.lost)) {
      pose = "celebrate";
      fr = ((vt * 6) | 0) % 4;
    } else if (g.anim && g.anim.kind === "slide") {
      pose = "celebrate";
      fr = 2;
      tilt = (g.tw.x - g.tw.c) * 0.04;
    } else if (g.anim && g.anim.kind === "clear") {
      pose = "celebrate";
      fr = 1 + (((vt * 8) | 0) % 2);
    } else if (g.armed) {
      pose = "stretch";
      fr = 0;
    } else if (g.bump > 0 || (state === "play" && moves.length <= 1 && g.started)) {
      pose = "surprised";
      fr = 0;
    } else if (!g.started) {
      pose = "wave";
      fr = ((vt * 3) | 0) % 2;
    }
    g.bump = Math.max(0, g.bump - dt);
    g.squash = Math.max(0, g.squash - dt * 6);
    if (g.armed) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.5 + (RM ? 0 : 0.2 * Math.sin(vt * 8));
      ctx.drawImage(glowArt("rgba(255,214,120,0.9)"), tx - C, ty - C, C * 2, C * 2);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    const S = C * 1.3;
    const shake = g.bump > 0 && g.bumpDir ? DIRS[g.bumpDir][0] * Math.sin(g.bump * 60) * C * 0.06 : 0;
    const shakeY = g.bump > 0 && g.bumpDir ? DIRS[g.bumpDir][1] * Math.sin(g.bump * 60) * C * 0.06 : 0;
    ctx.save();
    ctx.translate(tx + shake, ty - C * 0.1 + shakeY);
    ctx.rotate(tilt);
    ctx.scale(1 + 0.18 * g.squash, 1 - 0.18 * g.squash);
    ctx.drawImage(sprite(pose, fr), -S / 2, -S * 0.62, S, S);
    ctx.restore();
    // shooting stars in hand (above the board, left) and the meter toward the next
    if (g.cfg.charges != null || g.charges) {
      const ix = B.x;
      const iy = B.y - 34;
      for (let k = 0; k < MAX_CHARGES; k++) {
        ctx.globalAlpha = k < g.charges ? 1 : 0.22;
        ctx.drawImage(starArt(k < g.charges ? "lit" : "dim"), ix + k * 26, iy, 20, 20);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(ix, iy + 24, 74, 3);
      ctx.fillStyle = "#ffdc6e";
      ctx.fillRect(ix, iy + 24, 74 * (g.meter / METER), 3);
      if (!TOUCH && g.charges) {
        ctx.font = "600 12px Geist, ui-sans-serif, system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillStyle = g.armed ? "#ffdc6e" : "rgba(255,255,255,0.6)";
        ctx.fillText(g.armed ? "Now an arrow" : "Space", ix + 84, iy + 15);
      }
    }
    // hints
    for (const hn of g.hints) {
      if (state === "play" && hn.id !== "move") hn.life -= dt;
      let label;
      if (hn.id === "move") label = TOUCH ? "Swipe or use the arrows" : "Use the arrow keys";
      else if (hn.id === "next") label = "The next cloud lands where it's dashed";
      else label = "Clear a line next to a cloud to blow it away";
      ctx.globalAlpha = clamp(hn.life, 0, 1);
      label3d(label, W / 2, B.y + B.size + 36, "#ffffff", clamp(W * 0.04, 13, 18));
      ctx.globalAlpha = 1;
    }
    g.hints = g.hints.filter((hn) => hn.life > 0 && !(hn.id === "move" && g.started));
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
    drawCalls();
  }
  function label3d(s, x, y, col, size) {
    ctx.font = `800 ${Math.round(size)}px Geist, ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.lineWidth = Math.max(3, size * 0.25);
    ctx.strokeStyle = "rgba(10,18,40,0.75)";
    ctx.strokeText(s, x, y);
    ctx.fillStyle = col;
    ctx.fillText(s, x, y);
  }
  function drawCalls() {
    const c = G.calls[G.calls.length - 1];
    if (!c) return;
    const a = clamp(c.life * 2, 0, 1);
    const big = Math.round(clamp(W * 0.085, 26, 44) * c.size);
    const y = c.top ? B.y + B.cell * 0.85 : B.y + B.size * 0.42;
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.font = `800 ${big}px Fraunces, ui-serif, Georgia, serif`;
    ctx.lineWidth = 8;
    ctx.strokeStyle = "rgba(10,18,40,0.75)";
    ctx.strokeText(c.s, W / 2, y);
    ctx.fillStyle = c.col;
    ctx.fillText(c.s, W / 2, y);
    if (c.sub) {
      ctx.font = `700 ${Math.round(clamp(big * 0.42, 13, 18))}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeText(c.sub, W / 2, y + big * 0.62);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(c.sub, W / 2, y + big * 0.62);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- winning, losing, the end card ----------
  const moonsFor = (moves, par) => (moves <= par ? 3 : moves <= Math.round(par * 1.5) ? 2 : 1);
  const limitOf = (cfg) => cfg.limit || (cfg.par ? Math.round(cfg.par * 2.2) : Infinity);
  function win() {
    state = "won";
    G.endT = 0;
    G.lost = false;
    const n = G.night;
    G.moons = moonsFor(G.moves, G.cfg.par);
    if (!BOT || Q.has("save")) {
      progress.moons[n] = Math.max(progress.moons[n] || 0, G.moons);
      progress.unlocked = Math.max(progress.unlocked, Math.min(NIGHTS.length, n + 2));
      if (n === NIGHTS.length - 1) progress.allDone = true;
      store.set("progress", progress);
    }
    Sound.win();
    buzz(40);
    call("Night cleared!", "●".repeat(G.moons) + "○".repeat(3 - G.moons), "#86d3a0", 1, 9);
    for (let i = 0; i < 40; i++) burst(B.x + Math.random() * B.size, B.y + Math.random() * B.size, i % 2 ? "#ffdc6e" : "#fff3c4", 1, B.cell * 4, B.cell * 0.12);
  }
  function over(why) {
    state = "over";
    G.endT = 0;
    G.lost = true;
    G.why = why || "boxed";
    Sound.night();
    if (G.why === "morning") call("Morning came", "The night ended before the goal", "#ffd391", 1, 9);
    else call("Night falls", "Twinkle is boxed in", "#d8e6ff", 1, 9);
  }
  function finish() {
    state = "end";
    const endless = G.mode === "endless";
    const isBest = endless && G.score > G.best;
    if (isBest && !BOT) store.set("best", G.score);
    const rec = {
      id: Date.now(),
      at: new Date().toISOString().slice(0, 16),
      mode: endless ? "endless" : `night ${G.night + 1}`,
      won: !G.lost,
      moons: G.moons || 0,
      score: G.score,
      best: isBest,
      seconds: Math.round(G.clock),
      ...G.stats,
      fps: G.perf.frames ? Math.round(G.perf.frames / G.perf.sum) : null,
      worstFrameMs: Math.round(G.perf.worst),
      screen: `${W}x${H}`,
    };
    runs.push(rec);
    if (runs.length > 120) runs = runs.slice(-120);
    if (!BOT) store.set("runs", runs);
    window.__cs.last = rec;
    $("hud").hidden = true;
    $("pad").hidden = true;
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
    const endless = G.mode === "endless";
    const n = G.night;
    const won = !G.lost;
    card.append(el("h2", null, endless ? "Night falls" : won ? `Night ${n + 1} cleared` : G.why === "morning" ? "Morning came first" : "Boxed in"));
    if (!endless && won) card.append(el("div", "total", "●".repeat(rec.moons) + "○".repeat(3 - rec.moons)));
    else {
      const tot = el("div", "total");
      tot.append(starIcon(40), el("span", null, fmt(rec.score)));
      card.append(tot);
    }
    const chips = el("div", "chips");
    if (endless) {
      if (isBest && G.best > 0) chips.append(el("span", "chip gold", `New best, +${fmt(rec.score - G.best)}`));
      else if (isBest) chips.append(el("span", "chip gold", "Your first best"));
      else chips.append(el("span", "chip", `Best ${fmt(G.best)}`));
    } else if (won) {
      chips.append(el("span", "chip", `${rec.moves} moves · 3 moons in ${G.cfg.par} or fewer`));
      if (n === NIGHTS.length - 1) chips.append(el("span", "chip gold", "Every night cleared!"));
    } else {
      const g = goalNow();
      chips.append(el("span", "chip", `${g.text}: ${Math.min(g.have, g.need)} of ${g.need}`));
      if (G.why === "morning") chips.append(el("span", "chip", `${limitOf(G.cfg)} moves used`));
    }
    if (rec.triples || rec.bursts) chips.append(el("span", "chip gold", rec.bursts ? "Sky burst!" : "Triple!"));
    card.append(chips);
    const facts = el("p", "facts");
    facts.append(
      el("b", null, String(rec.lines)),
      document.createTextNode(rec.lines === 1 ? " line · " : " lines · "),
      el("b", null, String(rec.doubles + rec.triples + rec.bursts)),
      document.createTextNode(" combos · longest slide "),
      el("b", null, `${rec.longest} stars`),
    );
    card.append(facts);
    if (!won && !endless)
      card.append(
        el(
          "p",
          "tiny",
          G.why === "morning"
            ? "Tip: long slides and lines next to clouds get there faster."
            : "Tip: keep a shooting star for when the clouds close in, and don't stop in a corner.",
        ),
      );
    if (runs.length === 3 || runs.length === 10) card.append(noteBox(rec));
    const again = el("button", "btn");
    again.id = "againBtn";
    if (!endless && won && n < NIGHTS.length - 1) {
      again.textContent = `Next: Night ${n + 2}`;
      again.onclick = () => play("night", n + 1);
    } else if (!endless && won) {
      again.textContent = "Play Endless";
      again.onclick = () => play("endless", 0);
    } else {
      again.textContent = endless ? "Play again" : "Try again";
      again.onclick = () => play(G.mode, n);
    }
    card.append(again);
    if (!endless && won) {
      const replay = el("button", "btn ghost", "Play this night again");
      replay.onclick = () => play("night", n);
      card.append(replay);
    }
    const links = el("div", "links");
    const home = el("button", "link", "Nights");
    home.onclick = goHome;
    const note = el("button", "link", "Leave a note");
    note.onclick = () => {
      if (!card.querySelector(".note")) card.insertBefore(noteBox(rec), again);
    };
    links.append(home, note);
    card.append(links);
    if (!TOUCH) card.append(el("p", "tiny", "Enter for the button above, R to play this night again"));
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
  function play(mode = "night", night = 0) {
    Sound.unlock();
    newRun(mode, night);
    state = "play";
    $("start").hidden = true;
    $("end").hidden = true;
    $("pause").hidden = true;
    $("notes").hidden = true;
    $("hud").hidden = false;
    $("pad").hidden = !TOUCH;
    $("scoreN").textContent = "0";
    $("best").textContent = "";
    hud();
    if (!seen.has("move")) hint("move");
    call(mode === "endless" ? "Endless" : `Night ${night + 1}: ${G.cfg.name}`, G.cfg.tip, "#d8e6ff", 0.8, 2.8, true);
  }
  function pause() {
    state = "pause";
    $("pause").hidden = false;
    $("resumeBtn").focus({ preventScroll: true });
  }
  function resume() {
    state = "play";
    $("pause").hidden = true;
  }
  function goHome() {
    state = "menu";
    G = null;
    $("end").hidden = true;
    $("pause").hidden = true;
    $("hud").hidden = true;
    $("pad").hidden = true;
    buildStart();
    $("start").hidden = false;
  }
  function buildStart() {
    const h = $("hero").getContext("2d");
    h.clearRect(0, 0, 24, 24);
    h.drawImage(sprite("wave", 0), 0, 0);
    const next = Math.min(progress.unlocked, NIGHTS.length) - 1;
    $("playBtn").textContent = progress.allDone ? "Play Endless" : `Play Night ${next + 1}`;
    $("playBtn").onclick = () => (progress.allDone ? play("endless", 0) : play("night", next));
    const box = $("nights");
    box.replaceChildren();
    NIGHTS.forEach((nt, i) => {
      const b = el("button", "night" + (i === next && !progress.allDone ? " next" : ""));
      b.disabled = i >= progress.unlocked;
      const m = progress.moons[i] || 0;
      b.append(el("span", null, String(i + 1)), el("small", null, nt.name), el("span", "moons", m ? "●".repeat(m) + "○".repeat(3 - m) : ""));
      b.setAttribute("aria-label", `Night ${i + 1}: ${nt.name}${b.disabled ? " (locked)" : m ? `, ${m} moons` : ""}`);
      b.onclick = () => play("night", i);
      box.append(b);
    });
    const e = el("button", "night");
    e.disabled = !endlessOpen();
    e.append(el("span", null, "∞"), el("small", null, endlessOpen() ? "Endless" : "Opens after Night 3"));
    e.onclick = () => play("endless", 0);
    box.append(e);
    const best = store.get("best", 0);
    const moons = progress.moons.reduce((a, b) => a + (b || 0), 0);
    $("startBest").textContent =
      `${moons} of ${NIGHTS.length * 3} moons${best ? ` · Endless best ${fmt(best)}` : ""}${TOUCH ? "" : " · Arrow keys to move, Space for a shooting star"}`;
    $("soundBtn").textContent = Sound.on ? "Sound on" : "Sound off";
  }
  $("score").querySelector("canvas").getContext("2d").drawImage(starArt("lit"), 0, 0);
  $("starBtn").querySelector("canvas").getContext("2d").drawImage(starArt("lit"), 0, 0);
  $("pauseBtn").onclick = pause;
  $("resumeBtn").onclick = resume;
  $("restartBtn").onclick = () => play(G.mode, G.night);
  $("homeBtn").onclick = goHome;
  $("soundBtn").onclick = () => {
    Sound.toggle();
    $("soundBtn").textContent = Sound.on ? "Sound on" : "Sound off";
  };
  const logText = () =>
    [
      `Clear Skies runs (${runs.length}), newest last. Nights open: ${progress.unlocked}, moons: ${progress.moons.map((m) => m || 0).join("/")}.`,
      ...runs.map(
        (r) =>
          `${r.at} ${r.mode} ${r.won ? `WON ${r.moons} moons` : "lost"} score ${r.score}${r.best ? " (best)" : ""} ${r.seconds}s moves ${r.moves} lines ${r.lines} doubles ${r.doubles} triples ${r.triples} blown ${r.blown} gold ${r.gold} dashes ${r.dashes} winds ${r.winds} longest ${r.longest} bumps ${r.bumps} fps ${r.fps}${r.wantedAnother ? ` | another go: ${r.wantedAnother}` : ""}${r.note ? ` | "${r.note}"` : ""}`,
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
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(0.05, raw);
    if (G) G.vt += dt;
    if (state === "play") {
      if (G.started) {
        G.clock += dt;
        if (raw < 1) {
          G.perf.frames++;
          G.perf.sum += raw;
          G.perf.worst = Math.max(G.perf.worst, raw * 1000);
          if (raw > 1 / 40) G.perf.slow++;
        }
      }
      const sdt = dt * SPEED;
      if (BOT) bot(sdt);
      const steps = Math.ceil(SPEED / 2);
      for (let k = 0; k < steps && state === "play"; k++) animate(sdt / steps);
    }
    if (G && state !== "menu" && state !== "end") {
      for (const p of G.fx) {
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += B.cell * 6 * dt;
      }
      G.fx = G.fx.filter((p) => p.life > 0);
      for (const t of G.texts) {
        t.life -= dt;
        t.y -= B.cell * 0.8 * dt;
      }
      G.texts = G.texts.filter((t) => t.life > 0);
      for (const c of G.calls) c.life -= dt;
      G.calls = G.calls.filter((c) => c.life > 0);
    }
    if (state === "won" || state === "over") {
      // let the last clear finish, then a short beat, then the card
      G.endT += dt * (BOT ? 20 : 1);
      if (G.endT > 1.4) finish();
    }
    render(dt);
  }
  window.__cs = {
    get state() {
      return state;
    },
    get G() {
      return G;
    },
    play,
    move: (d) => tryMove(d),
    last: null,
  };
  buildStart();
  requestAnimationFrame(frame);
})();
