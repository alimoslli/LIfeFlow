/* Skyling Steps (prototype, 2026-11-16). The skylings at the heart, one step per arrow:
   every step leaves a star; you can't step on a star; a row or column full of stars flies up into the sky; don't get
   boxed in. Now and then a cloud forms (a countdown shows where); a cloud blocks its line until a clear beside it blows
   it away. You play the skyling you choose, or whoever is up in the real sky right now, under that skyling's own sky.
   The skylings, stars and clouds are drawn by the app's own code (window.Skylings, bundled by build.mjs). */
(() => {
  "use strict";
  const SK = window.Skylings;
  const BY = Object.fromEntries(SK.COMPANIONS.map((c) => [c.key, c]));
  const $ = (id) => document.getElementById(id);
  const Q = new URLSearchParams(location.search);
  const BOT = Q.has("bot");
  const HUMAN = Q.get("bot") === "human";
  const RM = !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const TOUCH = !!window.matchMedia?.("(pointer: coarse)").matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const TAU = Math.PI * 2;
  const SPEED = clamp(Number(Q.get("speed")) || 1, 1, 60);

  // ---------- tuning ----------
  const N = 7;
  const STEP_T = 0.07; // seconds a step takes: quick
  const CLEAR_T = 0.35;
  const LINE_PTS = 10; // a clear: this x lines x lines
  // a cloud forms every few steps: every 9 at first, every 5 later
  const cloudEvery = (steps) => clamp(9 - Math.floor(steps / 40), 5, 9);
  const WORDS = ["", "To the sky!", "Double!", "Triple!", "Sky burst!"];
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const DIR_KEYS = Object.keys(DIRS);
  const at = (c, r) => r * N + c;

  // the cast, each under its own sky (the app's sky colours for its moment: top, middle, horizon)
  const CAST = [
    { key: "dawn", name: "Dawn", moment: "First light", sky: ["#13284f", "#3f5d8c", "#d98a62"], night: false, sun: true },
    { key: "ray", name: "Ray", moment: "Daytime", sky: ["#2a76d0", "#6aaae6", "#c8e3f8"], night: false, sun: true },
    { key: "goldie", name: "Goldie", moment: "Golden hour", sky: ["#4a7fbf", "#a6bfd8", "#ffd391"], night: false, sun: true },
    { key: "star", name: "Twinkle", moment: "Evening", sky: ["#1a2d5a", "#344c7c", "#5a6588"], night: true, sun: false },
    { key: "moon", name: "Dreamy", moment: "Night", sky: ["#142451", "#233c6e", "#3a5a8f"], night: true, sun: false },
  ];
  // whoever is up in the real sky right now (the app follows the real sunrise and sunset; here, the clock)
  function nowKey() {
    const h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 5 && h < 8) return "dawn";
    if (h >= 8 && h < 16.5) return "ray";
    if (h >= 16.5 && h < 19) return "goldie";
    if (h >= 19 && h < 21) return "star";
    return "moon";
  }

  // ---------- this browser only ----------
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem("skylingsteps." + k);
        return v == null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem("skylingsteps." + k, JSON.stringify(v));
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
  function sprite(key, pose, frame, night) {
    const n = SK.FRAMES[pose].length;
    const f = ((frame % n) + n) % n;
    const id = `${key}|${pose}|${f}|${night}`;
    let cv = cache.get(id);
    if (cv) return cv;
    cv = document.createElement("canvas");
    cv.width = cv.height = 24;
    const g = cv.getContext("2d");
    const px = SK.pixels(BY[key], pose, f, night).filter(([, y]) => y < 23);
    if (night && key === "star") {
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
  const starArt = () => art("star", SK.STAR_ICON, { k: "#5a3d10", y: "#ffdc6e" });
  const stormArt = () => art("storm", SK.cloud(22), { X: "#3a4157", S: "#232838" });
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
      // each star left behind is a note; a row of steps walks up the scale
      step: (k) => tone(note(k % 10), 0.18, { type: "triangle", vol: 0.07 }),
      bump: () => tone(150, 0.09, { type: "triangle", vol: 0.08, slide: 0.7 }),
      clear: (n) => {
        [0, 4, 7, 12, 16, 19].slice(0, 2 + n).forEach((s, i) => tone(523.25 * 2 ** (s / 12), 0.55, { type: "triangle", vol: 0.1, at: i * 0.05 }));
        noise(0.35, { vol: 0.05, freq: 3000, at: 0.04 });
      },
      cloud: () => noise(0.25, { vol: 0.05, freq: 500, type: "lowpass" }),
      tick: () => tone(240, 0.05, { type: "triangle", vol: 0.03 }),
      best: () => [0, 2, 4, 7, 9, 12].forEach((s, i) => tone(note(5 + i), 0.3, { type: "triangle", vol: 0.1, at: i * 0.06 })),
      end: () => [0, 7, 16].forEach((s, i) => tone(196 * 2 ** (s / 12), 2, { vol: 0.06, attack: 0.4, at: i * 0.15 })),
    };
  })();
  const buzz = (ms) => {
    try {
      navigator.vibrate?.(ms);
    } catch {}
  };

  // ---------- screen: the board sits still in the middle of the skyling's sky ----------
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
    const top = 100;
    const bottom = TOUCH ? 170 : 80;
    const size = clamp(Math.min(W - 32, H - top - bottom), 238, 560);
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
  let choice = store.get("skyling", "auto");
  let runs = store.get("runs", []);
  const seen = new Set(store.get("hints", []));
  const skylingOf = (k) => CAST.find((c) => c.key === (k === "auto" ? nowKey() : k));

  function newRun() {
    const seed = Number(Q.get("seed")) || (Math.random() * 2 ** 31) | 0;
    const me = skylingOf(choice);
    G = {
      me,
      R: rng(seed),
      board: Array.from({ length: N * N }, () => ({ t: "sky", born: -1 })),
      pos: { c: 3, r: 3 },
      draw: { x: 3, y: 3 },
      score: 0,
      best: store.get("best", 0),
      passedBest: false,
      steps: 0,
      streak: 0,
      lastClear: -9,
      forecast: null,
      anim: null,
      queue: [],
      started: false,
      clock: 0,
      vt: 0,
      squash: 0,
      bump: 0,
      bumpDir: null,
      cheer: 0,
      up: [],
      fx: [],
      texts: [],
      calls: [],
      hints: [],
      endT: 0,
      botT: 0.6,
      stats: { steps: 0, stars: 0, lines: 0, doubles: 0, triples: 0, bursts: 0, blown: 0, clouds: 0, bumps: 0 },
      perf: { frames: 0, sum: 0, worst: 0 },
    };
    G.forecast = { i: pickCloudSpot(), left: cloudEvery(0) };
  }
  // a cloud forms on empty sky, never on the skyling or right next to it
  function pickCloudSpot() {
    const cand = [];
    for (let i = 0; i < N * N; i++) {
      const c = i % N;
      const r = (i / N) | 0;
      if (G.board[i].t !== "sky" || Math.abs(c - G.pos.c) + Math.abs(r - G.pos.r) <= 1) continue;
      cand.push(i);
    }
    return cand.length ? cand[(G.R() * cand.length) | 0] : null;
  }
  const free = (board, c, r) => c >= 0 && c < N && r >= 0 && r < N && board[at(c, r)].t === "sky";
  const movesFrom = (board, c, r) => DIR_KEYS.filter((d) => free(board, c + DIRS[d][0], r + DIRS[d][1]));
  // every row and column that is all stars (a cloud or empty sky in it keeps it from flying up)
  function fullLines(board) {
    const out = [];
    for (let k = 0; k < N; k++) {
      const row = Array.from({ length: N }, (_, c) => at(c, k));
      const col = Array.from({ length: N }, (_, r) => at(k, r));
      for (const idx of [row, col]) if (idx.every((i) => board[i].t === "star")) out.push(idx);
    }
    return out;
  }
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

  // ---------- the step ----------
  function step(dir) {
    if (state !== "play") return;
    Sound.unlock();
    if (G.anim) {
      if (G.queue.length < 3) G.queue.push(dir);
      return;
    }
    const [dc, dr] = DIRS[dir];
    const nc = G.pos.c + dc;
    const nr = G.pos.r + dr;
    if (!free(G.board, nc, nr)) {
      G.bump = 0.2;
      G.bumpDir = dir;
      G.stats.bumps++;
      Sound.bump();
      return;
    }
    // the square left behind becomes a star
    const from = at(G.pos.c, G.pos.r);
    G.board[from] = { t: "star", born: G.vt };
    G.steps++;
    G.stats.steps++;
    G.stats.stars++;
    G.score += 1;
    bumpScore();
    Sound.step(G.steps);
    G.anim = { kind: "step", from: { ...G.pos }, dir, t: 0 };
    G.pos = { c: nc, r: nr };
    G.started = true;
  }
  function animate(dt) {
    const a = G.anim;
    if (!a) return;
    a.t += dt;
    if (a.kind === "step") {
      const k = clamp(a.t / STEP_T, 0, 1);
      G.draw.x = a.from.c + (G.pos.c - a.from.c) * k;
      G.draw.y = a.from.r + (G.pos.r - a.from.r) * k;
      if (k >= 1) {
        G.draw = { x: G.pos.c, y: G.pos.r };
        settle();
      }
    } else if (a.kind === "clear" && a.t >= CLEAR_T) finishClear(a);
  }
  function settle() {
    const lines = fullLines(G.board);
    if (!lines.length) {
      G.anim = null;
      return endTurn();
    }
    const n = lines.length;
    G.streak = G.steps - G.lastClear <= 8 ? G.streak + 1 : 1;
    G.lastClear = G.steps;
    const mult = Math.min(3, 1 + 0.5 * (G.streak - 1));
    const pts = Math.round(LINE_PTS * n * n * mult);
    G.score += pts;
    bumpScore();
    G.stats.lines += n;
    if (n === 2) G.stats.doubles++;
    if (n === 3) G.stats.triples++;
    if (n >= 4) G.stats.bursts++;
    call(WORDS[Math.min(n, 4)], G.streak > 1 ? `+${pts} · streak ${G.streak}` : `+${pts}`, "#ffdc6e", n > 1 ? 1 : 0.8);
    Sound.clear(n);
    buzz(12 + n * 8);
    G.cheer = 0.7;
    const cells = new Set(lines.flat());
    const blown = blownBy(G.board, cells);
    G.stats.blown += blown.size;
    for (const i of blown) burst(cx(i % N), cy((i / N) | 0), "#cfd8ee", 10, B.cell * 5, B.cell * 0.12);
    // the stars fly up into the sky behind the board, and stay there
    for (const i of cells) {
      // a free spot in the open sky: not over the board, the score or the sea
      let tx = 0;
      let ty = 0;
      for (let k = 0; k < 20; k++) {
        tx = 12 + Math.random() * (W - 24);
        ty = 70 + Math.random() * (H - 200);
        const onBoard = tx > B.x - 24 && tx < B.x + B.size + 24 && ty > B.y - 24 && ty < B.y + B.size + 50;
        if (!onBoard) break;
      }
      G.up.push({ x: cx(i % N), y: cy((i / N) | 0), tx, ty, t: 0 });
    }
    G.anim = { kind: "clear", t: 0, cells, blown };
    checkBest();
  }
  function finishClear(a) {
    for (const i of [...a.cells, ...a.blown]) G.board[i] = { t: "sky", born: G.vt };
    if (G.forecast && a.cells.has(G.forecast.i)) G.forecast.i = pickCloudSpot();
    G.anim = null;
    endTurn();
  }
  function endTurn() {
    // the cloud countdown
    const f = G.forecast;
    if (f) {
      f.left--;
      if (f.left <= 0) {
        let i = f.i;
        if (i == null || G.board[i].t !== "sky" || i === at(G.pos.c, G.pos.r)) i = pickCloudSpot();
        if (i != null) {
          G.board[i] = { t: "cloud", born: G.vt };
          G.stats.clouds++;
          burst(cx(i % N), cy((i / N) | 0), "#9fb0d0", 8, B.cell * 2, B.cell * 0.08);
          Sound.cloud();
        }
        G.forecast = { i: pickCloudSpot(), left: cloudEvery(G.steps) };
      } else if (f.left <= 2) Sound.tick();
      if (G.forecast.i == null) G.forecast = null;
    }
    const ways = movesFrom(G.board, G.pos.c, G.pos.r).length;
    if (!ways || (BOT && G.steps >= (Number(Q.get("cap")) || 1e9))) return over();
    if (G.steps === 2) hint("line");
    if (G.steps === 9) hint("cloud");
    if (G.queue.length) step(G.queue.shift());
  }
  function checkBest() {
    if (G.passedBest || G.best <= 0 || G.score <= G.best) return;
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

  // ---------- feedback ----------
  function burst(x, y, col, n, sp, size = 4) {
    if (G.fx.length > 500) return;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const v = sp * (0.3 + Math.random() * 0.7);
      G.fx.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.3, max: 0.75, size: size * (0.6 + Math.random() * 0.8), col });
    }
  }
  function call(s, sub, col, size) {
    G.calls.push({ s, sub, col, size, life: 1.3 });
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

  // ---------- input: arrow keys (WASD too; hold to keep walking), swipes and on-screen arrows on a phone ----------
  const KEYS = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", KeyA: "left", KeyD: "right", KeyW: "up", KeyS: "down" };
  let lastRepeat = 0;
  window.addEventListener("keydown", (e) => {
    const d = KEYS[e.code];
    if (state === "play") {
      if (d) {
        e.preventDefault();
        // holding a key keeps walking, at a steady pace
        if (e.repeat && performance.now() - lastRepeat < 110) return;
        lastRepeat = performance.now();
        step(d);
      } else if (e.code === "Escape" || e.code === "KeyP") pause();
      return;
    }
    if (document.activeElement?.tagName === "TEXTAREA") return;
    if ((e.code === "Enter" || e.code === "Space" || e.code === "KeyR") && state === "end") {
      e.preventDefault();
      play();
    }
    if (e.code === "Escape" && state === "pause") resume();
  });
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
    if (Math.hypot(dx, dy) > 22) step(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down");
  });
  cv.addEventListener("pointercancel", () => (press = null));
  cv.addEventListener("contextmenu", (e) => e.preventDefault());
  for (const b of document.querySelectorAll(".dpad button"))
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      step(b.dataset.dir);
    });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state === "play") pause();
  });

  // ---------- the bot (?bot=1 plans ahead with room to move, ?bot=human slips now and then) ----------
  function room(board, c, r) {
    // how many squares the skyling could still reach
    const seenSq = new Set([at(c, r)]);
    const q = [[c, r]];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dc, dr] of Object.values(DIRS))
        if (free(board, x + dc, y + dr) && !seenSq.has(at(x + dc, y + dr))) {
          seenSq.add(at(x + dc, y + dr));
          q.push([x + dc, y + dr]);
        }
    }
    return seenSq.size;
  }
  function value(board, c, r, depth) {
    let best = -1e9;
    for (const d of movesFrom(board, c, r)) {
      const b = board.map((x) => ({ ...x }));
      b[at(c, r)] = { t: "star" };
      const nc = c + DIRS[d][0];
      const nr = r + DIRS[d][1];
      const lines = fullLines(b);
      const cells = new Set(lines.flat());
      const blown = blownBy(b, cells);
      for (const i of [...cells, ...blown]) b[i] = { t: "sky" };
      let v = lines.length * lines.length * 40 + blown.size * 25 + Math.min(room(b, nc, nr), 20) * 3;
      // lines that are nearly full are worth building toward
      for (let k = 0; k < N; k++)
        for (const idx of [Array.from({ length: N }, (_, x) => at(x, k)), Array.from({ length: N }, (_, y) => at(k, y))])
          if (!idx.some((i) => b[i].t === "cloud")) v += idx.filter((i) => b[i].t === "star").length ** 2 * 0.4;
      if (!movesFrom(b, nc, nr).length) v -= 1000;
      if (depth > 1) v += 0.6 * value(b, nc, nr, depth - 1);
      if (v > best) best = v;
    }
    return best === -1e9 ? -1000 : best;
  }
  function botChoose() {
    let best = null;
    for (const d of movesFrom(G.board, G.pos.c, G.pos.r)) {
      const b = G.board.map((x) => ({ ...x }));
      b[at(G.pos.c, G.pos.r)] = { t: "star" };
      const nc = G.pos.c + DIRS[d][0];
      const nr = G.pos.r + DIRS[d][1];
      const lines = fullLines(b);
      const cells = new Set(lines.flat());
      const blown = blownBy(b, cells);
      for (const i of [...cells, ...blown]) b[i] = { t: "sky" };
      let v = lines.length * lines.length * 40 + blown.size * 25 + Math.min(room(b, nc, nr), 20) * 3;
      if (!movesFrom(b, nc, nr).length) v -= 1000;
      v += 0.6 * value(b, nc, nr, HUMAN ? 1 : 3);
      if (!best || v > best.v) best = { d, v };
    }
    if (HUMAN && Math.random() < 0.2) {
      const ok = movesFrom(G.board, G.pos.c, G.pos.r);
      if (ok.length) return ok[(Math.random() * ok.length) | 0];
    }
    return best && best.d;
  }
  function bot(dt) {
    if (G.anim) return;
    G.botT -= dt;
    if (G.botT > 0) return;
    G.botT = HUMAN ? 0.35 + Math.random() * 0.4 : 0.1;
    const d = botChoose();
    if (d) step(d);
  }

  // ---------- drawing ----------
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const BG = Array.from({ length: 90 }, (_, i) => {
    const r = rng(i * 7919 + 3);
    return { x: r(), y: r() * 0.85, s: r() < 0.12 ? 2 : 1, ph: r() * TAU };
  });
  function render(dt) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const me = G ? G.me : skylingOf(choice);
    const vt = G ? G.vt : performance.now() / 1000;
    const sea = H - (TOUCH && state === "play" ? 26 : 56);
    const sky = ctx.createLinearGradient(0, 0, 0, sea);
    sky.addColorStop(0, me.sky[0]);
    sky.addColorStop(0.62, me.sky[1]);
    sky.addColorStop(1, me.sky[2]);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, sea);
    if (me.night || me.key === "dawn")
      for (const s of BG) {
        ctx.globalAlpha = (me.key === "dawn" ? 0.35 : 1) * (RM ? 0.6 : 0.4 + 0.3 * Math.sin(vt * 0.9 + s.ph));
        ctx.fillStyle = "#eef3ff";
        ctx.fillRect(s.x * W, s.y * sea, s.s * 1.5, s.s * 1.5);
      }
    ctx.globalAlpha = 1;
    // the sun by day, the moon by night
    const r0 = clamp(W * 0.05, 18, 34);
    const mx = W - r0 * 2.3;
    const my = me.key === "goldie" || me.key === "dawn" ? Math.min(H * 0.22, B.y - 30) : 66;
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = me.sun ? 0.45 : 0.4;
    ctx.drawImage(glowArt(me.sun ? "rgba(255,226,170,0.9)" : "rgba(200,220,255,0.8)"), mx - r0 * 3, my - r0 * 3, r0 * 6, r0 * 6);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = false;
    if (me.sun) ctx.drawImage(sunArt(), mx - r0, my - r0, r0 * 2, r0 * 2);
    else {
      ctx.fillStyle = "#e9eefb";
      ctx.beginPath();
      ctx.arc(mx, my, r0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#c9d3ea";
      for (const [a, b, r] of [
        [-0.3, -0.2, 0.18],
        [0.25, 0.15, 0.13],
        [-0.05, 0.4, 0.1],
      ]) {
        ctx.beginPath();
        ctx.arc(mx + a * r0, my + b * r0, r * r0, 0, TAU);
        ctx.fill();
      }
    }
    // the stars you've sent up stay in the sky
    if (G)
      for (const u of G.up) {
        u.t = Math.min(1, u.t + dt * 1.6);
        const k = 1 - (1 - u.t) ** 3;
        const x = u.x + (u.tx - u.x) * k;
        const y = u.y + (u.ty - u.y) * k;
        const sz = u.t < 1 ? B.cell * (0.55 - 0.35 * k) : 9 + (RM ? 0 : Math.sin(vt * 2 + u.tx) * 1.5);
        ctx.globalAlpha = u.t < 1 ? 1 : 0.85;
        ctx.drawImage(starArt(), x - sz / 2, y - sz / 2, sz, sz);
      }
    ctx.globalAlpha = 1;
    // the sea
    const [hr, hg, hb] = hex(me.sky[2]);
    const gr = ctx.createLinearGradient(0, sea, 0, H);
    gr.addColorStop(0, `rgb(${hr * 0.7},${hg * 0.75},${hb * 0.85})`);
    gr.addColorStop(1, "#14234a");
    ctx.fillStyle = gr;
    ctx.fillRect(0, sea, W, H - sea);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillRect(0, sea - 1, W, 2);
    if (G && state !== "menu") drawBoard(vt, dt);
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
    const day = !g.me.night;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = day ? "rgba(20,40,80,0.28)" : "rgba(8,16,38,0.42)";
    roundRect(B.x - 10, B.y - 10, B.size + 20, B.size + 20, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const clearing = g.anim && g.anim.kind === "clear" ? g.anim : null;
    // a line one star short glows softly
    if (!clearing)
      for (let k = 0; k < N; k++)
        for (const [idx, horiz] of [
          [Array.from({ length: N }, (_, c) => at(c, k)), true],
          [Array.from({ length: N }, (_, r) => at(k, r)), false],
        ]) {
          if (idx.some((i) => g.board[i].t === "cloud")) continue;
          if (idx.filter((i) => g.board[i].t === "star").length !== N - 1) continue;
          ctx.fillStyle = "rgba(255,220,110,0.12)";
          if (horiz) ctx.fillRect(B.x, B.y + k * C, B.size, C);
          else ctx.fillRect(B.x + k * C, B.y, C, B.size);
        }
    for (let i = 0; i < N * N; i++) {
      const c = i % N;
      const r = (i / N) | 0;
      const x = cx(c);
      const y = cy(r);
      const cell = g.board[i];
      ctx.fillStyle = (c + r) % 2 ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.07)";
      ctx.fillRect(B.x + c * C + 1, B.y + r * C + 1, C - 2, C - 2);
      const grow = cell.born >= 0 ? clamp((vt - cell.born) * 6, 0, 1) : 1;
      if (clearing && clearing.cells.has(i)) {
        const k = clearing.t / CLEAR_T;
        ctx.globalAlpha = 0.5 * (1 - k);
        ctx.fillStyle = "#fff3c4";
        ctx.fillRect(B.x + c * C, B.y + r * C, C, C);
        ctx.globalAlpha = 1;
        continue;
      }
      if (cell.t === "star") {
        const pulse = RM ? 1 : 1 + 0.05 * Math.sin(vt * 3 + i);
        const sz = C * 0.58 * (0.4 + 0.6 * grow) * pulse;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = day ? 0.35 : 0.55;
        ctx.drawImage(glowArt("rgba(255,210,90,0.9)"), x - sz * 1.3, y - sz * 1.3, sz * 2.6, sz * 2.6);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.drawImage(starArt(), x - sz / 2, y - sz / 2, sz, sz);
      } else if (cell.t === "cloud") {
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
      }
    }
    // where the next cloud forms, and in how many steps
    if (state === "play" && g.forecast && g.forecast.i != null && !clearing) {
      const i = g.forecast.i;
      const x0 = B.x + (i % N) * C;
      const y0 = B.y + ((i / N) | 0) * C;
      const soon = g.forecast.left <= 2;
      ctx.strokeStyle = soon ? "rgba(255,193,180,0.8)" : "rgba(207,224,255,0.45)";
      ctx.setLineDash([4, 5]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 4, y0 + 4, C - 8, C - 8);
      ctx.setLineDash([]);
      ctx.font = `800 ${Math.round(C * 0.34)}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = soon ? "#ffc1b4" : "rgba(207,224,255,0.7)";
      ctx.fillText(String(g.forecast.left), x0 + C / 2, y0 + C * 0.62);
    }
    // the skyling
    const moves = state === "play" && !g.anim ? movesFrom(g.board, g.pos.c, g.pos.r) : [];
    let pose = "idle";
    let fr = vt % 3.2 < 0.12 ? 1 : 0;
    if (state === "over" || state === "end") {
      pose = "sleep";
      fr = ((vt * 1.5) | 0) % 2;
    } else if (g.cheer > 0) {
      pose = "celebrate";
      fr = ((vt * 10) | 0) % 4;
    } else if (g.anim && g.anim.kind === "step") {
      pose = "walk";
      fr = g.steps % 4;
    } else if (g.bump > 0 || (state === "play" && g.started && moves.length === 1)) {
      pose = "surprised";
      fr = 0;
    } else if (!g.started) {
      pose = "wave";
      fr = ((vt * 3) | 0) % 2;
    } else if (g.steps - (g.idleAt || 0) > 0 && vt % 6 < 0.8) {
      pose = "stretch";
      fr = 0;
    }
    g.cheer = Math.max(0, g.cheer - dt);
    g.bump = Math.max(0, g.bump - dt);
    const tx = B.x + (g.draw.x + 0.5) * C;
    const ty = B.y + (g.draw.y + 0.5) * C;
    const flip = g.anim && g.anim.kind === "step" ? g.anim.dir === "left" : g.faceLeft;
    if (g.anim && g.anim.kind === "step" && (g.anim.dir === "left" || g.anim.dir === "right")) g.faceLeft = g.anim.dir === "left";
    const S = C * 1.25;
    const sh = g.bump > 0 && g.bumpDir ? Math.sin(g.bump * 60) * C * 0.06 : 0;
    ctx.save();
    ctx.translate(tx + (g.bumpDir && DIRS[g.bumpDir][0] ? sh : 0), ty - C * 0.08 + (g.bumpDir && DIRS[g.bumpDir][1] ? sh : 0));
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(sprite(g.me.key, pose, fr, g.me.night), -S / 2, -S * 0.62, S, S);
    ctx.restore();
    // the ways it can go: small chevrons
    for (const d of moves) {
      const [dx, dy] = DIRS[d];
      ctx.save();
      ctx.translate(tx + dx * C * 0.6, ty + dy * C * 0.6);
      ctx.rotate(Math.atan2(dy, dx));
      ctx.fillStyle = `rgba(255,255,255,${g.hints.some((h) => h.id === "move") ? 0.85 : 0.3})`;
      ctx.beginPath();
      ctx.moveTo(C * 0.09, 0);
      ctx.lineTo(-C * 0.05, -C * 0.08);
      ctx.lineTo(-C * 0.05, C * 0.08);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // hints
    for (const hn of g.hints) {
      if (state === "play" && hn.id !== "move") hn.life -= dt;
      const label =
        hn.id === "move"
          ? TOUCH
            ? "Swipe or use the arrows. Every step leaves a star"
            : "Use the arrow keys. Every step leaves a star"
          : hn.id === "line"
            ? "Fill a row or column with stars to send it up"
            : "A cloud blocks its line. Clear a line next to it to blow it away";
      ctx.globalAlpha = clamp(hn.life, 0, 1);
      label3d(label, W / 2, B.y + B.size + 34, "#ffffff", clamp(W * 0.036, 12, 17));
      ctx.globalAlpha = 1;
    }
    g.hints = g.hints.filter((hn) => hn.life > 0 && !(hn.id === "move" && g.started));
    for (const p of g.fx) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.col;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    const c0 = g.calls[g.calls.length - 1];
    if (c0) {
      const a = clamp(c0.life * 2, 0, 1);
      const big = Math.round(clamp(W * 0.085, 26, 44) * c0.size);
      const y = B.y + B.size * 0.42;
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.font = `800 ${big}px Fraunces, ui-serif, Georgia, serif`;
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(10,18,40,0.75)";
      ctx.strokeText(c0.s, W / 2, y);
      ctx.fillStyle = c0.col;
      ctx.fillText(c0.s, W / 2, y);
      ctx.font = `700 ${Math.round(clamp(big * 0.42, 13, 18))}px Geist, ui-sans-serif, system-ui, sans-serif`;
      ctx.lineWidth = 5;
      ctx.strokeText(c0.sub, W / 2, y + big * 0.62);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(c0.sub, W / 2, y + big * 0.62);
      ctx.globalAlpha = 1;
    }
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

  // ---------- the end ----------
  function over() {
    state = "over";
    G.endT = 0;
    Sound.end();
    G.calls.push({ s: `${G.me.name} is boxed in`, sub: "and falls asleep", col: "#d8e6ff", size: 0.8, life: 9 });
  }
  function finish() {
    state = "end";
    const isBest = G.score > G.best;
    if (isBest && !BOT) store.set("best", G.score);
    const rec = {
      id: Date.now(),
      at: new Date().toISOString().slice(0, 16),
      skyling: G.me.key,
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
    window.__ss.last = rec;
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
  function face(key, night, px, pose = "idle") {
    const k = document.createElement("canvas");
    k.width = k.height = 24;
    k.getContext("2d").drawImage(sprite(key, pose, 0, night), 0, 0);
    if (px) k.style.width = k.style.height = px + "px";
    return k;
  }
  function buildEnd(rec, isBest) {
    const card = $("endCard");
    card.replaceChildren();
    const sent = rec.lines * N;
    card.append(face(G.me.key, G.me.night, 72, "sleep"));
    card.append(el("h2", null, `${G.me.name} sent ${sent} stars to the sky`));
    const tot = el("div", "total");
    tot.append(el("span", null, fmt(rec.score)));
    card.append(tot);
    const chips = el("div", "chips");
    if (isBest && G.best > 0) chips.append(el("span", "chip gold", `New best, +${fmt(rec.score - G.best)}`));
    else if (isBest) chips.append(el("span", "chip gold", "Your first best"));
    else chips.append(el("span", "chip", `Best ${fmt(G.best)}`));
    if (rec.triples || rec.bursts) chips.append(el("span", "chip gold", rec.bursts ? "Sky burst!" : "Triple!"));
    else if (rec.doubles) chips.append(el("span", "chip gold", rec.doubles > 1 ? `${rec.doubles} Doubles` : "Double!"));
    card.append(chips);
    const facts = el("p", "facts");
    facts.append(
      el("b", null, String(rec.lines)),
      document.createTextNode(rec.lines === 1 ? " line · " : " lines · "),
      el("b", null, String(rec.steps)),
      document.createTextNode(" steps · "),
      el("b", null, String(rec.blown)),
      document.createTextNode(rec.blown === 1 ? " cloud blown away" : " clouds blown away"),
    );
    card.append(facts);
    if (runs.length === 3 || runs.length === 10) card.append(noteBox(rec));
    const again = el("button", "btn", "Play again");
    again.id = "againBtn";
    again.onclick = play;
    card.append(again);
    const links = el("div", "links");
    const home = el("button", "link", "Choose a skyling");
    home.onclick = goHome;
    const note = el("button", "link", "Leave a note");
    note.onclick = () => {
      if (!card.querySelector(".note")) card.insertBefore(noteBox(rec), again);
    };
    links.append(home, note);
    card.append(links);
    if (!TOUCH) card.append(el("p", "tiny", "Enter to play again"));
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
    $("pad").hidden = !TOUCH;
    $("scoreN").textContent = "0";
    $("best").textContent = G.best ? `Best ${fmt(G.best)}` : "";
    if (!seen.has("move")) hint("move");
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
    const box = $("cast");
    box.replaceChildren();
    for (const c of CAST) {
      const b = el("button", "pick");
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(choice === c.key));
      b.append(face(c.key, c.night, 0, "wave"), el("b", null, c.name), el("small", null, c.moment));
      b.onclick = () => {
        choice = c.key;
        store.set("skyling", choice);
        buildStart();
      };
      box.append(b);
    }
    let auto = $("autoPick");
    if (!auto) {
      auto = el("button", "auto");
      auto.id = "autoPick";
      auto.setAttribute("role", "radio");
      box.after(auto);
      auto.onclick = () => {
        choice = "auto";
        store.set("skyling", choice);
        buildStart();
      };
    }
    auto.setAttribute("aria-checked", String(choice === "auto"));
    auto.textContent = `Changes with the sky · now ${skylingOf("auto").name}`;
    const me = skylingOf(choice);
    $("playBtn").textContent = `Play as ${me.name}`;
    const best = store.get("best", 0);
    $("startBest").textContent =
      `${best ? `Your best: ${fmt(best)}` : ""}${best && !TOUCH ? " · " : ""}${TOUCH ? "" : "Arrow keys to walk (hold to keep going)"}`;
    $("soundBtn").textContent = Sound.on ? "Sound on" : "Sound off";
  }
  $("playBtn").onclick = play;
  $("score").querySelector("canvas").getContext("2d").drawImage(starArt(), 0, 0);
  $("pauseBtn").onclick = pause;
  $("resumeBtn").onclick = resume;
  $("restartBtn").onclick = play;
  $("soundBtn").onclick = () => {
    Sound.toggle();
    $("soundBtn").textContent = Sound.on ? "Sound on" : "Sound off";
  };
  const logText = () =>
    [
      `Skyling Steps runs (${runs.length}), newest last.`,
      ...runs.map(
        (r) =>
          `${r.at} ${r.skyling} score ${r.score}${r.best ? " (best)" : ""} ${r.seconds}s steps ${r.steps} lines ${r.lines} doubles ${r.doubles} triples ${r.triples} blown ${r.blown} clouds ${r.clouds} bumps ${r.bumps} fps ${r.fps}${r.wantedAnother ? ` | another go: ${r.wantedAnother}` : ""}${r.note ? ` | "${r.note}"` : ""}`,
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
      for (const c of G.calls) c.life -= dt;
      G.calls = G.calls.filter((c) => c.life > 0);
    }
    if (state === "over") {
      G.endT += dt * (BOT ? 20 : 1);
      if (G.endT > 1.6) finish();
    }
    render(dt);
  }
  window.__ss = {
    get state() {
      return state;
    },
    get G() {
      return G;
    },
    play,
    step: (d) => step(d),
    last: null,
  };
  buildStart();
  requestAnimationFrame(frame);
})();
