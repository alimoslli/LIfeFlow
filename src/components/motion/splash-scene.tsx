import { GRID, pixels } from "@/components/day-clock/companion";
import { COMPANION_KEYS, companionOf, type CompanionKey, ownsNight } from "@/lib/companions";

/**
 * The opening screen's scene (owner, 2026-11-10: "show this timing's skyling, same with the whole vibe"): the skyling
 * whose moment it is rises out of the water under that moment's sky, like the sun in the LifeFlow logo. Every skyling is
 * in the page; the inline script (splash.tsx) marks the moment on <html> before first paint and CSS shows that one, so
 * nothing flashes. The water and the horizon are drawn like the logo: a glowing glass line, soft swells, the light on
 * the water. Decorative only.
 */

/** A skyling as a few paths (one per colour, runs merged), light enough to keep all five in every page. */
function Skyling({ k, className }: { k: CompanionKey; className?: string }) {
  // later pixels paint over earlier ones (the eyes over the body), so keep only the top colour of each cell
  const top = new Map<string, [number, number, string]>();
  for (const p of pixels(companionOf(k), "idle", 0, ownsNight(k))) top.set(`${p[0]}:${p[1]}`, p);
  const rows = new Map<string, Map<number, number[]>>();
  for (const [x, y, col] of top.values()) {
    const byRow = rows.get(col) ?? new Map<number, number[]>();
    byRow.set(y, [...(byRow.get(y) ?? []), x]);
    rows.set(col, byRow);
  }
  const paths = [...rows].map(([fill, byRow]) => {
    let d = "";
    for (const [y, xs] of byRow) {
      xs.sort((a, b) => a - b);
      for (let i = 0; i < xs.length;) {
        let n = 1;
        while (xs[i + n] === xs[i] + n) n++;
        d += `M${xs[i]} ${y}h${n}v1h-${n}z`;
        i += n;
      }
    }
    return { fill, d };
  });
  return (
    <svg viewBox={`1 2 ${GRID - 2} ${GRID - 2}`} shapeRendering="crispEdges" className={className ?? `lf-splash-sk lf-splash-sk-${k}`} aria-hidden>
      {paths.map((p) => (
        <path key={p.fill} fill={p.fill} d={p.d} />
      ))}
    </svg>
  );
}

/** The logo's rays around a rising sun-time skyling: each pops in on its own. */
const RAYS: [number, number, string][][] = [
  [
    [0, 9, "#fff0bf"],
    [1, 9, "#f7a823"],
  ],
  [
    [4, 3, "#fff0bf"],
    [5, 4, "#f7a823"],
  ],
  [
    [9, 1, "#fff0bf"],
    [10, 1, "#fff0bf"],
    [9, 2, "#f7a823"],
    [10, 2, "#f7a823"],
  ],
  [
    [15, 3, "#fff0bf"],
    [14, 4, "#f7a823"],
  ],
  [
    [19, 9, "#fff0bf"],
    [18, 9, "#f7a823"],
  ],
];

/** Something always passing by (owner, 2026-11-11: "I just don't want to see the background blank"): a little ship at
 * night, two birds by day. Rows of letters, one colour each, "." empty. */
const SHIP = ["....cccc....", "...cwwccc...", ".ssssssssss.", "sTyTTyTTyTTs", ".ssssssssss."];
const SHIP_PAL: Record<string, string> = { c: "#bfe0ff", w: "#ffffff", s: "#a9b9d3", T: "#59606f", y: "#ffdc6e" };
const BIRD_UP = ["k.....k", ".k...k.", "..kkk.."];
const BIRD_DOWN = ["..kkk..", ".k...k.", "k.....k"];

function Pixels({ rows, pal, x = 0, y = 0 }: { rows: string[]; pal: Record<string, string>; x?: number; y?: number }) {
  return rows.flatMap((row, ry) =>
    [...row].map((ch, rx) => (pal[ch] ? <rect key={`${rx}:${ry}`} x={x + rx} y={y + ry} width={1} height={1} fill={pal[ch]} /> : null)),
  );
}

/** Where the stars sit (left, top in %), clear of the little moon and the skyling. */
const STARS = [
  [8, 14],
  [22, 34],
  [34, 9],
  [58, 22],
  [70, 46],
  [88, 62],
  [15, 58],
];

/** The light of the moment on the water, as short pixel bars that shimmer. */
const SHIMMER = [
  [7, 92],
  [15, 66],
  [23, 44],
  [31, 26],
];

export function SplashScene() {
  return (
    <>
      <div className="lf-splash-sky">
        <span className="lf-splash-glow" />
        {/* Star's evening: Moon small in the background, waiting for its turn */}
        <Skyling k="moon" className="lf-splash-mini lf-splash-mini-moon" />
        {/* passing by: a ship and a shooting star at night, two birds by day */}
        <svg className="lf-splash-pass lf-splash-ship" viewBox="0 0 12 5" shapeRendering="crispEdges" aria-hidden>
          <Pixels rows={SHIP} pal={SHIP_PAL} />
        </svg>
        <span className="lf-splash-pass lf-splash-shoot" aria-hidden />
        <svg className="lf-splash-pass lf-splash-birds" viewBox="0 0 18 8" shapeRendering="crispEdges" aria-hidden>
          <g className="lf-splash-flap-a">
            <Pixels rows={BIRD_UP} pal={{ k: "#2b3550" }} />
            <Pixels rows={BIRD_DOWN} pal={{ k: "#2b3550" }} x={10} y={4} />
          </g>
          <g className="lf-splash-flap-b">
            <Pixels rows={BIRD_DOWN} pal={{ k: "#2b3550" }} />
            <Pixels rows={BIRD_UP} pal={{ k: "#2b3550" }} x={10} y={4} />
          </g>
        </svg>
        <span className="lf-splash-stars" aria-hidden>
          {STARS.map(([left, top], i) => (
            <i key={i} style={{ left: `${left}%`, top: `${top}%`, ["--i" as string]: i }} />
          ))}
        </span>
        <div className="lf-splash-riser">
          <svg className="lf-splash-rays" viewBox="0 0 20 22" shapeRendering="crispEdges" aria-hidden>
            {RAYS.map((ray, i) => (
              <g key={i} className="lf-splash-ray" style={{ ["--i" as string]: i }}>
                {ray.map(([x, y, fill]) => (
                  <rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill={fill} />
                ))}
              </g>
            ))}
          </svg>
          {COMPANION_KEYS.map((k) => (
            <Skyling key={k} k={k} />
          ))}
          {/* Moon's turn: Star, very small, circles it */}
          <span className="lf-splash-orbit" aria-hidden>
            <Skyling k="star" className="lf-splash-mini lf-splash-mini-star" />
          </span>
        </div>
      </div>
      <span className="lf-splash-horizon" />
      <svg className="lf-splash-water" viewBox="0 0 400 300" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="lf-sw-a" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#6ea8ff" stopOpacity="0.3" />
            <stop offset="1" stopColor="#6ea8ff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 150C80 126 170 176 260 150C310 136 360 132 400 140V300H0Z" fill="url(#lf-sw-a)" />
        <path d="M0 150C80 126 170 176 260 150C310 136 360 132 400 140" fill="none" stroke="#a9ceff" strokeOpacity="0.4" strokeWidth="1.2" />
        <path d="M0 232C110 204 220 262 320 228C350 218 380 214 400 212V300H0Z" fill="url(#lf-sw-a)" />
        <path d="M0 232C110 204 220 262 320 228C350 218 380 214 400 212" fill="none" stroke="#a9ceff" strokeOpacity="0.28" strokeWidth="1.1" />
        <g className="lf-splash-shimmer" shapeRendering="crispEdges">
          {SHIMMER.map(([y, w], i) => (
            <rect key={y} x={200 - w / 2} y={y} width={w} height={3} style={{ ["--i" as string]: i }} />
          ))}
        </g>
      </svg>
    </>
  );
}
