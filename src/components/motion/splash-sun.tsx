/**
 * The LifeFlow sun (the owner's logo, docs/design/logo/, 2026-11-10) as pixels: a half sun with a face rising over the
 * water, its rays around it. Drawn as crisp SVG squares so it stays sharp at any size; the opening screen animates it in
 * CSS (globals.css, .lf-splash-*). One cell is one unit; the body sits on y = 9 (the horizon).
 */
const PAL: Record<string, string> = {
  k: "#3b2414", // outline
  y: "#ffc83d", // body
  Y: "#f7a823", // body, the shaded side
  c: "#fff0bf", // highlight
  w: "#ffffff",
  p: "#ff7f6e", // cheeks
};

const SUN = [
  ".......kkkk.......",
  ".....kkccyykk.....",
  "....kccyyyyyyk....",
  "...kcyyyyyyyyYk...",
  "..kyykwyyyykwyYk..",
  "..kyykkyyyykkyYk..",
  "..kyppyyyyyyppYk..",
  "kkkyyyyyyyyyyyYkkk",
  "kykyyyyyyyyyyyYkyk",
];

/** Rays: [x, y, colour], each ray its own group so it can pop in on its own. */
const RAYS: [number, number, string][][] = [
  [
    [-1, 2, "c"],
    [0, 2, "Y"],
  ],
  [
    [5, -3, "c"],
    [6, -2, "Y"],
  ],
  [
    [8, -4, "c"],
    [9, -4, "c"],
    [8, -3, "Y"],
    [9, -3, "Y"],
  ],
  [
    [12, -3, "c"],
    [11, -2, "Y"],
  ],
  [
    [18, 2, "c"],
    [17, 2, "Y"],
  ],
];

/** Runs of one colour in a row become one rect, so the picture is a few dozen shapes. */
function cells(rows: string[]) {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (row[x + n] === ch) n++;
      if (ch !== ".") out.push({ x, y, w: n, fill: PAL[ch] });
      x += n;
    }
  });
  return out;
}
const BODY = cells(SUN);

export function SplashSun({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="-1.5 -4.5 21 13.5" shapeRendering="crispEdges" aria-hidden>
      <g className="lf-splash-rays">
        {RAYS.map((ray, i) => (
          <g key={i} className="lf-splash-ray" style={{ ["--i" as string]: i }}>
            {ray.map(([x, y, c]) => (
              <rect key={`${x}:${y}`} x={x} y={y} width={1} height={1} fill={PAL[c]} />
            ))}
          </g>
        ))}
      </g>
      <g className="lf-splash-body">
        {BODY.map((r) => (
          <rect key={`${r.x}:${r.y}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
        ))}
      </g>
    </svg>
  );
}
