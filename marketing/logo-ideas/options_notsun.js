// Not the sun: five other marks, all on the same morning horizon so the app's look stays.
const LF = window.LF;
const hexOf = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const shade = (c, k) => hexOf(c.map((v) => v * k));
const skyFor = (minute) => { const [t, m, l] = LF.skyAt(minute, 405, 1010); return { top: hexOf(t), mid: hexOf(m), low: hexOf(l), horizon: hexOf(l), groundTop: shade(t, 0.55), groundBottom: shade(t, 0.3), horizonAt: 0.64 }; };
// A real skyling from the app's sprite code, peeking over the horizon (rows above `cut`).
function peek(key, id, o = {}) {
  const info = LF.COMPANIONS.find((c) => c.key === key);
  const px = LF.pixels(info, "idle", 0, !!o.night && !o.mono);
  const p = 4.1, cut = 15, ox = 50 - 12 * p, oy = H - cut * p;
  const has = new Set(px.filter(([, , c]) => !c.startsWith("rgba")).map(([x, y]) => `${x},${y}`));
  const inner = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => has.has(`${x + dx},${y + dy}`));
  const rects = px.filter(([x, y, col]) => y < cut && !col.startsWith("rgba")).map(([x, y, col]) => {
    if (o.mono && col === "#262320" && inner(x, y)) return "";
    return `<rect x="${(ox + x * p).toFixed(2)}" y="${(oy + y * p).toFixed(2)}" width="${p + 0.05}" height="${p + 0.05}" fill="${o.mono || col}"/>`;
  }).join("");
  const glow = o.mono || o.onSky ? "" : `<circle cx="50" cy="${H}" r="50" fill="url(#${id}g)"/>`;
  return `<defs><radialGradient id="${id}g" cx="50" cy="${H}" r="50" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${C.glow}" stop-opacity=".9"/><stop offset=".5" stop-color="${C.glowDeep}" stop-opacity=".38"/><stop offset="1" stop-color="${C.glowDeep}" stop-opacity="0"/></radialGradient>
    <clipPath id="${id}c"><rect x="0" y="0" width="100" height="${lineTop}"/></clipPath></defs>
    <g clip-path="url(#${id}c)">${glow}<g shape-rendering="crispEdges">${rects}</g></g>
    <rect x="${L.x}" y="${lineTop}" width="${L.w}" height="${L.h}" rx="${L.h / 2}" fill="${o.mono || C.horizon}"/>`;
}
const NIGHT_SKY = { top: "#03060f", mid: "#071226", low: "#13284d", horizon: "#2d4470", groundTop: "#0b1a3a", groundBottom: "#03060f", horizonAt: 0.64 };
const TIMES = { dawn: 390, ray: 540, noon: 750, goldie: 960, dusk: 1065, star: 1350 };

const OPTIONS = [
  {
    name: "Your skyling",
    line: "Ray, a real skyling from the app, peeking over the morning horizon. The characters become the brand, like the teaser.",
    mark: (id, o = {}) => peek("ray", id, o),
  },
  {
    name: "Little cloud",
    line: "A soft cloud with the skylings' face resting on the horizon. Calm, cute, and it means sky without being the sun.",
    mark(id, o = {}) {
      const blobs = [[33, 54, 13], [52, 45, 18.5], [69, 53, 12.5]];
      const shape = (r0, fill) => blobs.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + r0}" fill="${fill}"/>`).join("") + `<rect x="${20 - r0}" y="${50 - r0}" width="${62 + 2 * r0}" height="${30}" rx="${10 + r0}" fill="${fill}"/>`;
      const face = o.mono ? "" : `<circle cx="45" cy="54" r="3.1" fill="${C.ink}"/><circle cx="59" cy="54" r="3.1" fill="${C.ink}"/><ellipse cx="38.5" cy="59.5" rx="3.6" ry="2.3" fill="#f0937a" opacity=".8"/><ellipse cx="65.5" cy="59.5" rx="3.6" ry="2.3" fill="#f0937a" opacity=".8"/>`;
      const cut = o.mono ? `<circle cx="45" cy="54" r="3.1" fill="#000"/><circle cx="59" cy="54" r="3.1" fill="#000"/>` : "";
      if (o.mono) return `<defs><clipPath id="${id}c"><rect width="100" height="${lineTop - 2.2}"/></clipPath><mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#000"/><g clip-path="url(#${id}c)">${shape(0, "#fff")}</g>${cut}</mask></defs>
        <rect width="100" height="100" fill="${o.mono}" mask="url(#${id}m)"/><rect x="${L.x}" y="${lineTop}" width="${L.w}" height="${L.h}" rx="${L.h / 2}" fill="${o.mono}"/>`;
      return `<defs><linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d4e6f8"/></linearGradient>
        <clipPath id="${id}c"><rect width="100" height="${lineTop}"/></clipPath></defs>
        <g clip-path="url(#${id}c)">${o.night || o.onSky ? "" : shape(1.6, "#9dc3e8")}${shape(0, `url(#${id}f)`)}${face}</g>
        <rect x="${L.x}" y="${lineTop}" width="${L.w}" height="${L.h}" rx="${L.h / 2}" fill="${C.horizon}"/>`;
    },
  },
  {
    name: "Sleepy moon",
    line: "A crescent moon with a sleepy face and a little star, for the planner that also watches your nights.",
    sky: NIGHT_SKY,
    mark(id, o = {}) {
      const body = o.mono || "#e8eef8", edge = "#9eb0cc";
      const cres = `<mask id="${id}cm" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect width="100" height="100" fill="#000"/><circle cx="47" cy="40" r="25" fill="#fff"/><circle cx="60" cy="31" r="21" fill="#000"/>
        ${o.mono ? `<path d="M30.5 41.5 q4 3.2 8 0" stroke="#000" stroke-width="2.4" fill="none" stroke-linecap="round"/>` : ""}</mask>`;
      const star = (x, y, s, f) => `<path d="M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z" fill="${f}"/>`;
      return `<defs>${cres}</defs>
        ${o.mono ? "" : `<g mask="url(#${id}cm)"><circle cx="47" cy="40" r="26.4" fill="${edge}"/></g>`}
        <g mask="url(#${id}cm)"><circle cx="47" cy="40" r="25" fill="${body}" transform="${o.mono ? "" : "translate(0.6 0.6) scale(.985)"}" transform-origin="47 40"/></g>
        ${o.mono ? "" : `<path d="M30.5 41.5 q4 3.2 8 0" stroke="${C.ink}" stroke-width="2.2" fill="none" stroke-linecap="round"/><ellipse cx="33" cy="48" rx="3.2" ry="2" fill="#f0937a" opacity=".75"/>`}
        ${star(70, 50, 6.5, o.mono || "#ffd77a")}${star(80, 34, 3.4, o.mono || "#ffd77a")}
        <rect x="${L.x}" y="${lineTop}" width="${L.w}" height="${L.h}" rx="${L.h / 2}" fill="${o.mono || C.horizon}"/>`;
    },
  },
  {
    name: "The day's path",
    line: "No character: the path the sky takes across your day, from morning to night, and a gold dot that is now. Simple and grown-up.",
    mark(id, o = {}) {
      let dots = "";
      const n = 13, R0 = 38;
      for (let i = 0; i < n; i++) {
        const t = Math.PI + (i / (n - 1)) * Math.PI;
        const minute = 405 + (i / (n - 1)) * (1010 - 405);
        const [, mid, low] = LF.skyAt(minute, 405, 1010);
        const col = o.mono || (i < 2 ? hexOf(low) : i > n - 3 ? hexOf(low) : hexOf(mid));
        dots += `<circle cx="${(50 + R0 * Math.cos(t)).toFixed(2)}" cy="${(H - 3 + R0 * Math.sin(t)).toFixed(2)}" r="2.7" fill="${col}"/>`;
      }
      const tn = Math.PI + (3.4 / (n - 1)) * Math.PI;
      const nx = 50 + R0 * Math.cos(tn), ny = H - 3 + R0 * Math.sin(tn);
      return `${dots}${o.mono ? "" : `<circle cx="${nx}" cy="${ny}" r="13" fill="${C.glow}" opacity=".55"/>`}
        <circle cx="${nx}" cy="${ny}" r="8.6" fill="${o.mono ? "none" : "#ffffff"}"/><circle cx="${nx}" cy="${ny}" r="6.6" fill="${o.mono || C.sun}"/>
        <rect x="${L.x}" y="${lineTop}" width="${L.w}" height="${L.h}" rx="${L.h / 2}" fill="${o.mono || C.horizon}"/>`;
    },
  },
  {
    name: "Whoever's up",
    line: "The logo is whichever skyling's time it is: Dawn at first light, Ray in the morning, Star at night. On the website and socials it follows the clock; the app icon stays Ray.",
    six: true,
    mark: (id, o = {}) => peek(o.key || "ray", id, o),
  },
];
