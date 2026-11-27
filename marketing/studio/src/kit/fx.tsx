import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { pixelPaths } from "../app-bridge";
import { rng } from "./util";

/** Film grain (seeded per frame, so renders repeat exactly) and a soft vignette. */
export function Grain({ amount = 0.08, vignette = 0.45 }: { amount?: number; vignette?: number }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg width="100%" height="100%" style={{ position: "absolute", opacity: amount, mixBlendMode: "overlay" }}>
        <filter id={`g${frame}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={frame % 97} />
        </filter>
        <rect width="100%" height="100%" filter={`url(#g${frame})`} />
      </svg>
      <AbsoluteFill style={{ background: `radial-gradient(ellipse at center, transparent 55%, rgb(0 0 0 / ${vignette}) 100%)` }} />
    </AbsoluteFill>
  );
}
/** Particles that burst from a point (sparkles, coins, stars): seeded, gravity optional. */
export function Burst({ at, x, y, n = 40, colors = ["#ffd77a", "#fff4cf", "#8fb6ff"], gravity = 0.6, spread = 1, seed = 1, size = 10 }: { at: number; x: number; y: number; n?: number; colors?: string[]; gravity?: number; spread?: number; seed?: number; size?: number }) {
  const frame = useCurrentFrame();
  const t = frame - at;
  if (t < 0 || t > 70) return null;
  const r = rng(seed);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: n }, (_, i) => {
        const a = r() * Math.PI * 2;
        const v = (6 + r() * 14) * spread;
        const px = x + Math.cos(a) * v * t;
        const py = y + Math.sin(a) * v * t + gravity * t * t * 0.5;
        const s = size * (0.5 + r());
        const c = colors[i % colors.length];
        return <div key={i} style={{ position: "absolute", left: px, top: py, width: s, height: s, background: c, opacity: interpolate(t, [40, 70], [1, 0], { extrapolateLeft: "clamp" }), transform: `rotate(${t * 9 + i * 37}deg)` }} />;
      })}
    </AbsoluteFill>
  );
}
/** One of the app's own pixel icons (from the day wheel), by its emoji key, e.g. 💵 🎓 💼 🏋️ ✏️ 📅. */
export function PixelIcon({ emoji, size = 96, style }: { emoji: string; size?: number; style?: React.CSSProperties }) {
  const p = pixelPaths(emoji);
  if (!p) return <span style={{ fontSize: size * 0.8, ...style }}>{emoji}</span>;
  return (
    <svg viewBox="0 0 12 12" width={size} height={size} shapeRendering="crispEdges" style={style}>
      {p.map((x, i) => (
        <path key={i} fill={x.fill} d={x.d} />
      ))}
    </svg>
  );
}
/** A scene's own fade in and out (frames), for clean cuts between separately rendered scenes. */
export function Fade({ children, inF = 6, outF = 6 }: { children: React.ReactNode; inF?: number; outF?: number }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const a = inF > 0 ? interpolate(frame, [0, inF], [0, 1], { extrapolateRight: "clamp" }) : 1;
  const b = outF > 0 ? interpolate(frame, [durationInFrames - outF, durationInFrames], [1, 0], { extrapolateLeft: "clamp" }) : 1;
  return <AbsoluteFill style={{ opacity: Math.min(a, b) }}>{children}</AbsoluteFill>;
}
