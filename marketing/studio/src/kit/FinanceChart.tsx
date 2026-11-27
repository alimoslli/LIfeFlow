import { interpolate, useCurrentFrame } from "remotion";
import { tok } from "../app-bridge";
import { F } from "./fonts";
import { prog, useLayout } from "./util";

/** An area chart that draws itself (the app's chart colours), with an end-point label counting up. Values in dollars. */
export function FinanceChart({ values, at = 0, dur = 40, w, h, label, x, y, color = tok("series-income") }: { values: number[]; at?: number; dur?: number; w?: number; h?: number; label?: string; x?: number; y?: number; color?: string }) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const W = w ?? L.width - L.safe.side * 2;
  const H = h ?? 420 * L.u;
  const max = Math.max(...values) * 1.1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * W, H - (v / max) * H] as const);
  const p = prog(frame, at, at + dur);
  const n = Math.max(2, Math.ceil(p * (pts.length - 1)) + 1);
  const shown = pts.slice(0, n);
  const lastI = Math.min(pts.length - 1, Math.floor(p * (pts.length - 1)));
  const frac = p * (pts.length - 1) - lastI;
  const tip = lastI < pts.length - 1 ? [pts[lastI][0] + (pts[lastI + 1][0] - pts[lastI][0]) * frac, pts[lastI][1] + (pts[lastI + 1][1] - pts[lastI][1]) * frac] : pts[lastI];
  shown[shown.length - 1] = tip as [number, number];
  const line = shown.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const val = interpolate(p, [0, 1], [values[0], values[values.length - 1]]);
  return (
    <div style={{ position: "absolute", left: x ?? L.safe.side, top: y ?? L.height * 0.45 }}>
      <svg width={W} height={H + 10} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="fc" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.45" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={0} x2={W} y1={H * g} y2={H * g} stroke="#fff" strokeOpacity={0.12} strokeDasharray="4 8" />
        ))}
        <path d={`${line} L${tip[0]} ${H} L0 ${H} Z`} fill="url(#fc)" />
        <path d={line} fill="none" stroke={color} strokeWidth={6 * L.u} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={tip[0]} cy={tip[1]} r={12 * L.u} fill="#fff" stroke={color} strokeWidth={5 * L.u} />
      </svg>
      <div style={{ position: "absolute", left: Math.min(tip[0], W - 260 * L.u), top: tip[1] - 92 * L.u, fontFamily: F.ui, fontWeight: 700, fontSize: 52 * L.u, color: "#fff", fontVariantNumeric: "tabular-nums", opacity: p > 0 ? 1 : 0 }}>
        ${Math.round(val).toLocaleString("en-US")}
        {label && <div style={{ fontSize: 26 * L.u, fontWeight: 500, opacity: 0.7 }}>{label}</div>}
      </div>
    </div>
  );
}
