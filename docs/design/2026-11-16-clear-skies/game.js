/* Clear Skies (prototype, 2026-11-16). A still night sky on a 7 x 7 grid. One arrow key (or swipe, or a click on the side
   you want) slides Twinkle until a cloud or the edge stops it, lighting every star it passes. A row or column of lit stars
   clears and blows away the clouds touching it. A storm cloud drifts in after each move, and you can see where. Boxed in:
   night falls.
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
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const TAU = Math.PI * 2;
  const SPEED = clamp(Number(Q.get("speed")) || 1, 1, 60);

  // ---------- tuning ----------
  const N = 7; // the board is N x N
  const SLIDE = 18; // cells a second
  const CLEAR_T = 0.45; // seconds a clear takes to play out
  const START_CLOUDS = 3;
  const REFILL = 6; // empty sky cells that get a new star after each move
  // one cloud after each move; from move 25 a growing chance of two, from move 110 a chance of three
  const cloudsFor = (move, r) => 1 + (r() < clamp((move - 25) / 110, 0, 0.8) ? 1 : 0) + (r() < clamp((move - 110) / 160, 0, 0.5) ? 1 : 0);
  const LINE_PTS = 10; // a clear is worth this x lines x lines, more on a streak
  const WORDS = ["", "Clear!", "Double!", "Triple!", "Sky burst!"];
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const DIR_KEYS = Object.keys(DIRS);

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
  const STAR_PAL = { dim: { k: "#4d5f80", y: "#dfe7f5" }, lit: { k: "#5a3d10", y: "#ffdc6e" } };
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
      slide: () => noise(0.16, { vol: 0.06, freq: 1400, sweep: 1.8 }),
      star: (k) => {
        tone(note(Math.min(2 + k, 14)), 0.4, { vol: 0.16 });
        tone(note(Math.min(2 + k, 14)) * 2, 0.15, { vol: 0.035 });
      },
      stop: () => tone(170, 0.12, { vol: 0.1, slide: 1.5 }),
      bump: () => tone(150, 0.1, { type: "triangle", vol: 0.09, slide: 0.7 }),
      clear: (n) => {
        [0, 4, 7, 12, 16, 19].slice(0, 2 + n).forEach((s, i) => tone(523.25 * 2 ** (s / 12), 0.55, { type: "triangle", vol: 0.1, at: i * 0.06 }));
        noise(0.4, { vol: 0.05, freq: 3000, at: 0.05 });
      },
      puff: () => noise(0.25, { vol: 0.06, freq: 500, type: "lowpass" }),
      best: () => [0, 2, 4, 7, 9, 12].forEach((s, i) => tone(note(5 + i), 0.35, { type: "triangle", vol: 0.1, at: i * 0.07 })),
      night: () => [0, 7, 16].forEach((s, i) => tone(196 * 2 ** (s / 12), 2.2, { vol: 0.06, attack: 0.4, at: i * 0.15 })),
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
    const top = 104;
    const bottom = 96;
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

  // ---------- a run ----------
  let state = "menu"; // menu | play | pause | over | end
  let G = null;
  let runs = store.get("runs", []);
  const seen = new Set(store.get("hints", []));
  const at = (c, r) => r * N + c;

  function newRun() {
    const seed = Number(Q.get("seed")) || (Math.random() * 2 ** 31) | 0;
    G = {
      R: rng(seed),
      board: Array.from({ length: N * N }, () => ({ t: "star", lit: false, born: -1, litT: -9 })),
      tw: { c: 3, r: 3, x: 3, y: 3 },
      score: 0,
      best: store.get("best", 0),
      passedBest: false,
      moves: 0,
      streak: 0,
      forecast: [],
      anim: null,
      queue: null,
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
      overT: 0,
      botT: 0.8,
      stats: { moves: 0, lines: 0, doubles: 0, triples: 0, bursts: 0, clearSkies: 0, bestCombo: 0, longest: 0, bumps: 0, cloudsMade: 0, blown: 0 },
      perf: { frames: 0, sum: 0, worst: 0, slow: 0 },
    };
    G.board[at(3, 3)].lit = true;
    for (const i of pickCloudSpots(START_CLOUDS, true)) G.board[i].t = "cloud";
    G.forecast = pickCloudSpots(1);
  }

  // where the next clouds land: on stars, mostly dim ones, never on Twinkle, rarely right next to it
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
        if (cell.t === "cloud" || (c === tw.c && r === tw.r) || out.includes(i)) continue;
        const near = Math.abs(c - tw.c) + Math.abs(r - tw.r) === 1;
        // the opening clouds stay out of Twinkle's row and column, so the second move can clear the first line
        if (start && (c === tw.c || r === tw.r)) continue;
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

  function pathFor(board, c, r, dir) {
    const [dc, dr] = DIRS[dir];
    const path = [];
    for (;;) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= N || nr < 0 || nr >= N || board[at(nc, nr)].t === "cloud") break;
      c = nc;
      r = nr;
      path.push(at(nc, nr));
    }
    return path;
  }
  // every row and column that is all lit stars (a cloud in it blocks the clear)
  function fullLines(board) {
    const out = [];
    for (let k = 0; k < N; k++) {
      const row = Array.from({ length: N }, (_, c) => at(c, k));
      const col = Array.from({ length: N }, (_, r) => at(k, r));
      for (const idx of [row, col]) if (idx.every((i) => board[i].t === "star" && board[i].lit)) out.push(idx);
    }
    return out;
  }
  // the clouds touching a cleared line get blown away with it
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
  const movesFrom = (board, c, r) => DIR_KEYS.filter((d) => pathFor(board, c, r, d).length);

  // ---------- the move ----------
  function tryMove(dir) {
    if (state !== "play") return;
    Sound.unlock();
    if (G.anim) {
      G.queue = dir;
      return;
    }
    const path = pathFor(G.board, G.tw.c, G.tw.r, dir);
    if (!path.length) {
      G.bump = 0.25;
      G.bumpDir = dir;
      G.stats.bumps++;
      Sound.bump();
      return;
    }
    G.anim = { kind: "slide", path, from: { c: G.tw.c, r: G.tw.r }, dir, i: 0, pos: 0, lit: 0 };
    G.moves++;
    G.stats.moves++;
    G.started = true;
    Sound.slide();
  }
  function animate(dt) {
    const a = G.anim;
    if (!a) return;
    if (a.kind === "slide") {
      a.pos = Math.min(a.path.length, a.pos + SLIDE * dt);
      // light each star as Twinkle reaches it: +1, +2, +3 ... in one slide
      while (a.i < a.path.length && a.pos >= a.i + 0.6) {
        const idx = a.path[a.i];
        const cell = G.board[idx];
        if (cell.t === "star" && !cell.lit) {
          cell.lit = true;
          cell.litT = G.vt;
          a.lit++;
          G.score += a.lit;
          bumpScore();
          const c = idx % N;
          const r = (idx / N) | 0;
          text(cx(c), cy(r) - B.cell * 0.45, `+${a.lit}`, a.lit >= 4 ? "#ffdc6e" : "#ffffff", 14 + Math.min(a.lit, 6) * 2);
          burst(cx(c), cy(r), "#ffdc6e", 7, B.cell * 3, B.cell * 0.09);
          Sound.star(a.lit);
        }
        a.i++;
      }
      const [dc, dr] = DIRS[a.dir];
      G.tw.x = a.from.c + dc * a.pos;
      G.tw.y = a.from.r + dr * a.pos;
      if (a.pos >= a.path.length) {
        const last = a.path[a.path.length - 1];
        G.tw.c = last % N;
        G.tw.r = (last / N) | 0;
        G.tw.x = G.tw.c;
        G.tw.y = G.tw.r;
        G.squash = 1;
        G.stats.longest = Math.max(G.stats.longest, a.lit);
        Sound.stop();
        if (a.lit >= 5) call(a.lit >= 6 ? "Shooting through!" : "Long slide!", `${a.lit} stars in one slide`, "#ffdc6e", 0.8);
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
    const streakMult = Math.min(3, 1 + 0.5 * (G.streak - 1));
    const pts = Math.round(LINE_PTS * n * n * streakMult);
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
    if (blown.size) G.stats.blown += blown.size;
    G.anim = { kind: "clear", t: 0, cells, lines, blown };
    checkBest();
  }
  function finishClear(a) {
    // the lit stars rise into the sky and leave the night empty there; new stars come back a few at a time
    for (const i of [...a.cells, ...a.blown]) G.board[i] = { t: "sky", lit: false, born: G.vt, litT: -9 };
    // forecast clouds in a cleared line are blown away too
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
    // the forecast clouds land; one that finds Twinkle in its spot drifts to another (standing on it doesn't stop it)
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
        if (movesFrom(b, G.tw.c, G.tw.r).length) break;
        landing.splice(k--, 1);
      }
    for (const i of landing) {
      G.board[i] = { t: "cloud", lit: false, born: G.vt, litT: -9 };
      G.stats.cloudsMade++;
      burst(cx(i % N), cy((i / N) | 0), "#9fb0d0", 6, B.cell * 2, B.cell * 0.08);
    }
    if (G.forecast.length) Sound.puff();
    // new stars appear in a few empty spots
    const empty = [];
    for (let i = 0; i < N * N; i++) if (G.board[i].t === "sky" && i !== at(G.tw.c, G.tw.r)) empty.push(i);
    for (let k = 0; k < REFILL && empty.length; k++) {
      const i = empty.splice((G.R() * empty.length) | 0, 1)[0];
      G.board[i] = { t: "star", lit: false, born: G.vt, litT: -9 };
    }
    G.forecast = pickCloudSpots(cloudsFor(G.moves, G.R));
    if (!movesFrom(G.board, G.tw.c, G.tw.r).length || (BOT && G.moves >= (Number(Q.get("cap")) || 1e9))) return over();
    hints();
    if (G.queue) {
      const d = G.queue;
      G.queue = null;
      tryMove(d);
    }
  }
  function checkBest() {
    if (!G.passedBest && G.best > 0 && G.score > G.best) {
      G.passedBest = true;
      setTimeout(() => {
        if (state === "play") {
          call("New best!", "Keep going", "#86d3a0", 1);
          Sound.best();
        }
      }, 500);
    }
  }

  // ---------- hints, once per device, one at a time ----------
  function hint(id) {
    if (seen.has(id) || G.hints.length) return;
    G.hints.push({ id, life: id === "move" ? 999 : 3.6 });
    seen.add(id);
    if (!BOT) store.set("hints", [...seen]);
  }
  function hints() {
    if (G.moves >= 1) hint("line");
    if (G.moves >= 2) hint("next");
    if (G.moves >= 4) hint("cloud");
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
    G.texts.push({ x, y, s, col, size, life: 0.85 });
  }
  function call(s, sub, col, size) {
    G.calls.push({ s, sub, col, size, life: 1.5 });
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

  // ---------- input: one key, one swipe, or one click per move ----------
  const KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down" };
  window.addEventListener("keydown", (e) => {
    const d = KEYS[e.code];
    if (d && state === "play") {
      e.preventDefault();
      if (!e.repeat) tryMove(d);
      return;
    }
    if ((e.code === "Space" || e.code === "Enter") && state === "end" && document.activeElement?.tagName !== "TEXTAREA") {
      e.preventDefault();
      play();
    }
    if (e.code === "Escape" && state === "play") pause();
  });
  // the side of Twinkle a point is on (click or tap), by the longer distance
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
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "play") pause();
  });

  // ---------- the bot (?bot=1 thinks two moves ahead, ?bot=human one move and slips now and then) ----------
  function sim(board, tw, dir, forecast) {
    const path = pathFor(board, tw.c, tw.r, dir);
    if (!path.length) return null;
    const b = board.map((x) => ({ ...x }));
    let pts = 0;
    let k = 0;
    for (const i of path)
      if (b[i].t === "star" && !b[i].lit) {
        b[i].lit = true;
        pts += ++k;
      }
    const last = path[path.length - 1];
    const nt = { c: last % N, r: (last / N) | 0 };
    const lines = fullLines(b);
    const cells = new Set(lines.flat());
    const blown = blownBy(b, cells);
    for (const i of [...cells, ...blown]) b[i] = { t: "sky", lit: false };
    for (const i of forecast) if (i !== last && b[i].t !== "cloud" && !cells.has(i) && !blown.has(i)) b[i] = { t: "cloud", lit: false };
    pts += LINE_PTS * lines.length * lines.length + blown.size * 8;
    const mob = movesFrom(b, nt.c, nt.r).length;
    const clouds = b.filter((x) => x.t === "cloud").length;
    let near = 0;
    for (let k = 0; k < N; k++)
      for (const idx of [Array.from({ length: N }, (_, c) => at(c, k)), Array.from({ length: N }, (_, r) => at(k, r))])
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
      const ok = DIR_KEYS.filter((d) => pathFor(G.board, G.tw.c, G.tw.r, d).length);
      if (ok.length) return ok[(Math.random() * ok.length) | 0];
    }
    return best && best.d;
  }
  function bot(dt) {
    if (G.anim) return;
    G.botT -= dt;
    if (G.botT > 0) return;
    G.botT = HUMAN ? 0.9 + Math.random() * 0.8 : 0.25;
    const d = botChoose();
    if (d) tryMove(d);
  }

  // ---------- drawing ----------
  const BG = Array.from({ length: 120 }, (_, i) => {
    const r = rng(i * 7919 + 3);
    return { x: r(), y: r() * 0.8, s: r() < 0.12 ? 2 : 1, ph: r() * TAU };
  });
  function render(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const vt = G ? G.vt : performance.now() / 1000;
    const sea = H - 64;
    // the night sky, still
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
    // the moon
    const mr = clamp(W * 0.06, 22, 40);
    const mx = W - mr * 2.2;
    const my = Math.max(70, B.y * 0.5);
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
    // the sea at the bottom, with the moon on it
    const gr = ctx.createLinearGradient(0, sea, 0, H);
    gr.addColorStop(0, "#3a5a8f");
    gr.addColorStop(1, "#14234a");
    ctx.fillStyle = gr;
    ctx.fillRect(0, sea, W, H - sea);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(0, sea - 1, W, 2);
    ctx.fillStyle = "rgba(220,232,255,0.4)";
    for (let i = 0; i < 5; i++) {
      const ww = 50 - i * 7 + (RM ? 0 : Math.sin(vt * 1.5 + i) * 5);
      ctx.fillRect(mx - ww / 2, sea + 8 + i * 10, ww, 3);
    }
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

  function drawBoard(vt, dt) {
    const g = G;
    const C = B.cell;
    ctx.imageSmoothingEnabled = false;
    // the board: a pane of night glass
    ctx.fillStyle = "rgba(8,16,38,0.42)";
    roundRect(B.x - 10, B.y - 10, B.size + 20, B.size + 20, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.1)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // a line one star from clearing glows softly, so the next good move is easy to see
    const clearing = g.anim && g.anim.kind === "clear" ? g.anim : null;
    for (let k = 0; k < N; k++) {
      for (const [idx, horiz] of [
        [Array.from({ length: N }, (_, c) => at(c, k)), true],
        [Array.from({ length: N }, (_, r) => at(k, r)), false],
      ]) {
        const left = idx.filter((i) => g.board[i].t === "star" && !g.board[i].lit).length;
        if (left !== 1 || clearing || idx.some((i) => g.board[i].t !== "star")) continue;
        ctx.fillStyle = "rgba(255,220,110,0.07)";
        if (horiz) ctx.fillRect(B.x, B.y + k * C, B.size, C);
        else ctx.fillRect(B.x + k * C, B.y, C, B.size);
      }
    }
    // cells
    for (let i = 0; i < N * N; i++) {
      const c = i % N;
      const r = (i / N) | 0;
      const x = cx(c);
      const y = cy(r);
      const cell = g.board[i];
      ctx.fillStyle = (c + r) % 2 ? "rgba(255,255,255,0.025)" : "rgba(255,255,255,0.045)";
      ctx.fillRect(B.x + c * C + 1, B.y + r * C + 1, C - 2, C - 2);
      const grow = cell.born >= 0 ? clamp((vt - cell.born) * 4, 0, 1) : 1;
      const fade = clearing && clearing.cells.has(i) ? 1 - clearing.t / CLEAR_T : 1;
      if (clearing && clearing.cells.has(i)) {
        // the cleared line flashes and its stars rise
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = "#fff3c4";
        ctx.fillRect(B.x + c * C, B.y + r * C, C, C);
        ctx.globalAlpha = 1;
      }
      if (cell.t === "cloud") {
        const away = clearing && clearing.blown.has(i) ? clearing.t / CLEAR_T : 0;
        const w = C * 1.08 * (0.5 + 0.5 * grow) * (1 + away * 0.6);
        ctx.globalAlpha = fade * (1 - away);
        ctx.fillStyle = "rgba(190,210,245,0.55)";
        for (let k = 0; k < 3; k++) ctx.fillRect(x - w * 0.3 + k * w * 0.3, y + C * 0.12 + ((vt * C * 1.5 + k * 9) % (C * 0.28)), 2, C * 0.12);
        ctx.drawImage(stormArt(), x - w / 2, y - C * 0.28, w, C * 0.4);
        ctx.fillStyle = "#e7ecf8";
        const e = Math.max(2, Math.round(C * 0.06));
        ctx.fillRect(x - C * 0.17, y - C * 0.12, e, e);
        ctx.fillRect(x + C * 0.13, y - C * 0.12, e, e);
        ctx.globalAlpha = 1;
      } else {
        const lit = cell.lit;
        const lift = clearing && clearing.cells.has(i) ? -C * 0.5 * (clearing.t / CLEAR_T) : 0;
        const pulse = lit && !RM ? 1 + 0.05 * Math.sin(vt * 3 + i) : 1;
        const sz = C * (lit ? 0.6 : 0.46) * grow * pulse * (fade < 1 ? 1 + (1 - fade) * 0.4 : 1);
        if (lit) {
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.55 * fade;
          ctx.drawImage(glowArt("rgba(255,210,90,0.9)"), x - sz * 1.3, y - sz * 1.3 + lift, sz * 2.6, sz * 2.6);
          ctx.globalCompositeOperation = "source-over";
        }
        ctx.globalAlpha = (lit ? 1 : 0.75) * fade;
        ctx.drawImage(starArt(lit ? "lit" : "dim"), x - sz / 2, y - sz / 2 + lift, sz, sz);
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
    // on a laptop, where a click on this side would take Twinkle
    if (state === "play" && g.hover && !g.anim) {
      const path = pathFor(g.board, g.tw.c, g.tw.r, g.hover);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      for (const i of path) ctx.fillRect(cx(i % N) - 3, cy((i / N) | 0) + C * 0.32, 6, 6);
      if (path.length) {
        const l = path[path.length - 1];
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 2;
        ctx.strokeRect(B.x + (l % N) * C + 3, B.y + ((l / N) | 0) * C + 3, C - 6, C - 6);
      }
    }
    // the ways Twinkle can go: small chevrons at its sides
    const moves = state === "play" && !g.anim ? movesFrom(g.board, g.tw.c, g.tw.r) : [];
    const tx = B.x + (g.tw.x + 0.5) * C;
    const ty = B.y + (g.tw.y + 0.5) * C;
    const firstRun = !seen.has("move") || g.hints.some((h) => h.id === "move");
    for (const d of moves) {
      const [dx, dy] = DIRS[d];
      const off = C * (0.62 + (RM ? 0 : 0.04 * Math.sin(vt * 5)));
      ctx.save();
      ctx.translate(tx + dx * off, ty + dy * off);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = `rgba(255,255,255,${firstRun ? 0.85 : 0.35})`;
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
    if (state === "over" || state === "end") {
      pose = "sleep";
      fr = ((vt * 1.5) | 0) % 2;
    } else if (g.anim && g.anim.kind === "slide") {
      pose = "celebrate";
      fr = 2;
      tilt = DIRS[g.anim.dir][0] * 0.25;
    } else if (g.anim && g.anim.kind === "clear") {
      pose = "celebrate";
      fr = 1 + (((vt * 8) | 0) % 2);
    } else if (g.bump > 0 || (state === "play" && moves.length <= 1 && g.started)) {
      pose = "surprised";
      fr = 0;
    } else if (!g.started) {
      pose = "wave";
      fr = ((vt * 3) | 0) % 2;
    }
    g.bump = Math.max(0, g.bump - dt);
    g.squash = Math.max(0, g.squash - dt * 5);
    const S = C * 1.3;
    const shake = g.bump > 0 && g.bumpDir ? DIRS[g.bumpDir][0] * Math.sin(g.bump * 60) * C * 0.06 : 0;
    const shakeY = g.bump > 0 && g.bumpDir ? DIRS[g.bumpDir][1] * Math.sin(g.bump * 60) * C * 0.06 : 0;
    ctx.save();
    ctx.translate(tx + shake, ty - C * 0.1 + shakeY);
    ctx.rotate(tilt);
    ctx.scale(1 + 0.18 * g.squash, 1 - 0.18 * g.squash);
    ctx.drawImage(sprite(pose, fr), -S / 2, -S * 0.62, S, S);
    ctx.restore();
    // hints
    for (const hn of g.hints) {
      if (state === "play" && hn.id !== "move") hn.life -= dt;
      let label;
      let x = W / 2;
      let y = B.y + B.size + 40;
      if (hn.id === "move") label = TOUCH ? "Swipe to slide Twinkle" : "Use the arrow keys to slide Twinkle";
      else if (hn.id === "line") label = "Light a whole row or column to clear it";
      else if (hn.id === "next") label = "The next cloud lands where it's dashed";
      else label = "Clear a line next to a cloud to blow it away";
      ctx.globalAlpha = clamp(hn.life, 0, 1);
      label3d(label, x, y, "#ffffff", clamp(W * 0.04, 13, 18));
      ctx.globalAlpha = 1;
    }
    g.hints = g.hints.filter((hn) => hn.life > 0 && !(hn.id === "move" && g.started));
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
    const y = Math.max(B.y - 26, 120);
    const big = Math.round(clamp(W * 0.085, 26, 44) * c.size);
    ctx.globalAlpha = a;
    ctx.textAlign = "center";
    ctx.font = `800 ${big}px Fraunces, ui-serif, Georgia, serif`;
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(10,18,40,0.7)";
    ctx.strokeText(c.s, W / 2, y);
    ctx.fillStyle = c.col;
    ctx.fillText(c.s, W / 2, y);
    if (c.sub) {
      ctx.font = `600 ${Math.round(big * 0.42)}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = 4;
      ctx.strokeText(c.sub, W / 2, y + big * 0.62);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(c.sub, W / 2, y + big * 0.62);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- the end of a run ----------
  function over() {
    state = "over";
    G.overT = 0;
    Sound.night();
    call("Night falls", "Twinkle is boxed in", "#d8e6ff", 1);
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
      ...G.stats,
      fps: G.perf.frames ? Math.round(G.perf.frames / G.perf.sum) : null,
      worstFrameMs: Math.round(G.perf.worst),
      screen: `${W}x${H}`,
    };
    runs.push(rec);
    if (runs.length > 80) runs = runs.slice(-80);
    store.set("runs", runs);
    window.__cs.last = rec;
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
    card.append(el("h2", null, "Night falls"));
    const tot = el("div", "total");
    tot.append(starIcon(40), el("span", null, fmt(rec.score)));
    card.append(tot);
    const chips = el("div", "chips");
    if (isBest && G.best > 0) chips.append(el("span", "chip gold", `New best, +${fmt(rec.score - G.best)}`));
    else if (isBest) chips.append(el("span", "chip gold", "Your first best"));
    else chips.append(el("span", "chip", `Best ${fmt(G.best)}`));
    if (rec.triples || rec.bursts) chips.append(el("span", "chip gold", rec.bursts ? "Sky burst!" : "Triple!"));
    card.append(chips);
    const facts = el("p", "facts");
    facts.append(
      el("b", null, String(rec.lines)),
      document.createTextNode(rec.lines === 1 ? " line cleared · " : " lines cleared · "),
      el("b", null, String(rec.moves)),
      document.createTextNode(" moves · longest slide "),
      el("b", null, `${rec.longest} stars`),
    );
    card.append(facts);
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
    hint("move");
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
    const h = $("hero").getContext("2d");
    h.clearRect(0, 0, 24, 24);
    h.drawImage(sprite("wave", 0), 0, 0);
    const best = store.get("best", 0);
    $("startBest").textContent = best ? `Your best: ${fmt(best)}` : "";
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
      `Clear Skies runs (${runs.length}), newest last.`,
      ...runs.map(
        (r) =>
          `${r.at} score ${r.score}${r.best ? " (best)" : ""} ${r.seconds}s moves ${r.moves} lines ${r.lines} doubles ${r.doubles} triples ${r.triples} bursts ${r.bursts} clear-skies ${r.clearSkies} longest ${r.longest} bumps ${r.bumps} fps ${r.fps} worst ${r.worstFrameMs}ms${r.wantedAnother ? ` | another go: ${r.wantedAnother}` : ""}${r.note ? ` | "${r.note}"` : ""}`,
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
      // fast-forwarded runs (bots) play the animations in small steps
      const steps = Math.ceil(SPEED / 2);
      for (let k = 0; k < steps && state === "play"; k++) animate(sdt / steps);
    }
    if (G && (state === "play" || state === "over" || state === "pause")) {
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
    if (state === "over") {
      G.overT += dt;
      if (G.overT > (BOT ? 0.05 : 1.6)) finish();
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
