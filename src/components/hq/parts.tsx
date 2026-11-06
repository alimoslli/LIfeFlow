import type { ReactNode } from "react";

/** Shared drawing pieces for the HQ office scene. Colours come from the `.hq` CSS variables (light and dark). */
export const v = (name: string) => `var(--hq-${name})`;

/** Defined once per page; rooms reference these with <use>. Kept in the document (0×0), never display:none, so gradients resolve. */
export function SceneDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <defs>
        <radialGradient id="hq-glow">
          <stop offset="0" style={{ stopColor: v("lamp"), stopOpacity: 0.85 }} />
          <stop offset="0.45" style={{ stopColor: v("lamp"), stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: v("lamp"), stopOpacity: 0 }} />
        </radialGradient>
        <g id="hq-leaf">
          <path d="M0 0C14-2 24 8 22 22 8 24-2 14 0 0Z" fill={v("plant")} />
          <path d="M2 20 18 6" stroke={v("plant-d")} strokeWidth="1.6" strokeLinecap="round" fill="none" />
        </g>
        <g id="hq-plant">
          <path d="M-9 0h18l-2-13h-14z" fill={v("pot")} />
          <rect x="-10" y="-15" width="20" height="3.5" rx="1.5" fill={v("pot")} />
          <ellipse cx="-8" cy="-24" rx="4.6" ry="11" transform="rotate(-32 -8 -24)" fill={v("plant-d")} />
          <ellipse cx="8" cy="-24" rx="4.6" ry="11" transform="rotate(32 8 -24)" fill={v("plant-d")} />
          <ellipse cx="0" cy="-28" rx="5" ry="13" fill={v("plant")} />
          <ellipse cx="-3" cy="-22" rx="3" ry="8" transform="rotate(-14 -3 -22)" fill={v("plant")} opacity=".8" />
        </g>
        <g id="hq-mug">
          <rect x="-5" y="-10" width="10" height="10" rx="2.5" fill={v("mug")} />
          <path d="M5-7.5c4 0 4 5 0 5" stroke={v("mug")} strokeWidth="2" fill="none" />
          <rect x="-4" y="-9.5" width="8" height="2.4" rx="1.2" fill="#000" opacity=".16" />
        </g>
        <g id="hq-books">
          <rect x="0" y="-7" width="26" height="7" rx="1.5" fill="#d4795a" />
          <rect x="2" y="-14" width="22" height="7" rx="1.5" fill="#e3b85c" />
          <rect x="-1" y="-21" width="24" height="7" rx="1.5" fill="#5f9f82" />
          <rect x="3" y="-5" width="16" height="1.4" fill="#fff" opacity=".35" />
        </g>
        <g id="hq-lamp">
          <ellipse cx="0" cy="-1.5" rx="9" ry="2.6" fill={v("wood-d")} />
          <path d="M0-2 4-22 14-34" stroke={v("wood-d")} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M6-31 22-29 17-40Z" fill={v("lamp-shade")} />
          <circle cx="15" cy="-29" r="3" fill={v("lamp")} />
        </g>
        <g id="hq-sofa">
          <rect x="0" y="-26" width="64" height="26" rx="10" fill={v("sofa")} />
          <rect x="6" y="-14" width="52" height="14" rx="6" fill={v("sofa-l")} />
          <rect x="-4" y="-18" width="12" height="20" rx="6" fill={v("sofa")} />
          <rect x="56" y="-18" width="12" height="20" rx="6" fill={v("sofa")} />
        </g>
      </defs>
    </svg>
  );
}

export const Use = ({ id, x = 0, y = 0, s = 1, flip = false }: { id: string; x?: number; y?: number; s?: number; flip?: boolean }) => (
  <use href={`#${id}`} transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`} />
);

/** A pool of warm light. Switched off (hidden) when the room is offline. */
export const Glow = ({ x, y, r, className = "" }: { x: number; y: number; r: number; className?: string }) => (
  <circle className={`hq-glow ${className}`} cx={x} cy={y} r={r} fill="url(#hq-glow)" />
);

/** The wall, floor and baseboard of a room. */
export function Shell({ w = 320, h = 220, floorY = 150, children }: { w?: number; h?: number; floorY?: number; children?: ReactNode }) {
  const planks = [];
  for (let y = floorY + 14; y < h; y += 14) planks.push(<path key={y} d={`M0 ${y}H${w}`} stroke={v("floor-2")} strokeWidth="1.2" />);
  return (
    <>
      <rect width={w} height={floorY} fill={v("wall")} />
      <rect y="0" width={w} height="26" fill={v("wall-2")} opacity=".55" />
      <rect y={floorY} width={w} height={h - floorY} fill={v("floor")} />
      {planks}
      <rect y={floorY - 4} width={w} height="6" fill={v("wood-l")} />
      {children}
    </>
  );
}

export function Window({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <g>
      <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} rx="4" fill={v("win-frame")} />
      <rect x={x} y={y} width={w} height={h} rx="2" fill={v("sky-b")} />
      <rect x={x} y={y} width={w} height={h * 0.55} rx="2" fill={v("sky-a")} opacity=".85" />
      <circle className="hq-sun" cx={x + w * 0.7} cy={y + h * 0.3} r={Math.min(w, h) * 0.13} fill="#ffd978" />
      <g className="hq-moon">
        <circle cx={x + w * 0.7} cy={y + h * 0.3} r={Math.min(w, h) * 0.14} fill="#fff3cf" />
        <circle cx={x + w * 0.76} cy={y + h * 0.26} r={Math.min(w, h) * 0.12} fill={v("sky-a")} />
        <circle cx={x + w * 0.25} cy={y + h * 0.2} r="1.2" fill="#fff" />
        <circle cx={x + w * 0.45} cy={y + h * 0.1} r="1" fill="#fff" />
      </g>
      <path
        d={`M${x} ${y + h}V${y + h * 0.82}l${w * 0.12}-${h * 0.1}l${w * 0.1} ${h * 0.06}l${w * 0.14}-${h * 0.16}l${w * 0.12} ${h * 0.12}l${w * 0.14}-${h * 0.08}l${w * 0.14} ${h * 0.1}l${w * 0.14}-${h * 0.06}V${y + h}Z`}
        fill={v("hill")}
      />
      <path d={`M${x + w / 2} ${y}V${y + h}M${x} ${y + h / 2}H${x + w}`} stroke={v("win-frame")} strokeWidth="2" />
      <rect x={x - 5} y={y + h + 2} width={w + 10} height="4" rx="2" fill={v("wood-l")} />
    </g>
  );
}

export function Desk({ x, w, y = 148 }: { x: number; w: number; y?: number }) {
  return (
    <g>
      <rect x={x + 6} y={y + 8} width={w - 12} height="46" fill={v("wood-d")} />
      <rect x={x + 12} y={y + 14} width={(w - 30) / 2} height="16" rx="3" fill={v("wood")} />
      <rect x={x + 18 + (w - 30) / 2} y={y + 14} width={(w - 30) / 2} height="16" rx="3" fill={v("wood")} />
      <rect x={x + 12 + (w - 30) / 4 - 7} y={y + 20} width="14" height="3" rx="1.5" fill={v("brass")} />
      <rect x={x + 18 + (w - 30) * 0.75 - 7} y={y + 20} width="14" height="3" rx="1.5" fill={v("brass")} />
      <rect x={x} y={y} width={w} height="9" rx="3" fill={v("wood-l")} />
      <rect x={x} y={y + 6} width={w} height="3" rx="1.5" fill="#000" opacity=".12" />
    </g>
  );
}

export function Bed({ x = 8, y = 150, w = 120 }: { x?: number; y?: number; w?: number }) {
  return (
    <g>
      <rect x={x - 2} y={y - 40} width="10" height="62" rx="4" fill={v("wood-d")} />
      <rect x={x + 2} y={y} width={w} height="14" rx="4" fill={v("wood")} />
      <rect x={x + 2} y={y + 12} width="8" height="12" fill={v("wood-d")} />
      <rect x={x + w - 6} y={y + 12} width="8" height="12" fill={v("wood-d")} />
      <rect x={x + 6} y={y - 8} width={w - 4} height="12" rx="6" fill={v("bed")} />
    </g>
  );
}
