import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { SUN, darkness, rgbCss, skyAt } from "../app-bridge";
import { rng } from "./util";

/**
 * The app's sky at any minute (the app's own colour keys, lib/sky.ts), with its stars and clouds.
 * `minute` can move: pass [from, to] to run the day across the scene.
 */
export function Sky({ minute, clouds = 4, stars = true, seed = 7, sun = true }: { minute: number | [number, number]; clouds?: number; stars?: boolean; seed?: number; sun?: boolean }) {
  const frame = useCurrentFrame();
  const { durationInFrames, width, height } = useVideoConfig();
  const m = Array.isArray(minute) ? interpolate(frame, [0, durationInFrames - 1], minute, { extrapolateRight: "clamp" }) : minute;
  const [top, mid, hor] = skyAt(m, SUN.rise, SUN.set);
  const dark = darkness(m, SUN.rise, SUN.set);
  const r = rng(seed);
  const starList = Array.from({ length: 90 }, () => ({ x: r() * width, y: r() * height * 0.7, s: 1 + r() * 2.4, ph: r() * 6.28 }));
  const cloudList = Array.from({ length: clouds }, (_, i) => ({ y: 0.12 + r() * 0.45, w: 0.22 + r() * 0.25, sp: 0.15 + r() * 0.35, x0: r(), i }));
  // the sun or moon rides an arc from rise to set
  const dayP = (m - SUN.rise) / (SUN.set - SUN.rise);
  const nightP = ((m - SUN.set + 1440) % 1440) / (1440 - (SUN.set - SUN.rise));
  const p = dark < 0.5 ? dayP : nightP;
  const bx = width * (0.12 + 0.76 * p);
  const by = height * (0.62 - 0.42 * Math.sin(Math.PI * Math.min(1, Math.max(0, p))));
  return (
    <AbsoluteFill style={{ background: `linear-gradient(180deg, ${rgbCss(top)} 0%, ${rgbCss(mid)} 55%, ${rgbCss(hor)} 100%)` }}>
      {stars && dark > 0.05 && (
        <svg width={width} height={height} style={{ position: "absolute", opacity: dark }}>
          {starList.map((s, i) => (
            <rect key={i} x={s.x} y={s.y} width={s.s} height={s.s} fill="#fff" opacity={0.45 + 0.55 * Math.abs(Math.sin(frame / 20 + s.ph))} />
          ))}
        </svg>
      )}
      {sun && (
        <div
          style={{
            position: "absolute",
            left: bx - 60,
            top: by - 60,
            width: 120,
            height: 120,
            borderRadius: "50%",
            background: dark < 0.5 ? "radial-gradient(circle, #fff8dc 0%, #ffe2a0 45%, #ffd27a00 70%)" : "radial-gradient(circle, #eef4ff 0%, #a9c1ec88 45%, #a9c1ec00 70%)",
            filter: "blur(1px)",
          }}
        />
      )}
      {cloudList.map((c) => {
        const x = ((c.x0 * (width + 600) + frame * c.sp * 2) % (width + 600)) - 300;
        const w = c.w * width;
        return (
          <div key={c.i} style={{ position: "absolute", left: x, top: c.y * height, width: w, height: w * 0.32, opacity: 0.55 - dark * 0.3 }}>
            <div style={{ position: "absolute", inset: "30% 0 0 0", borderRadius: 999, background: "#fff" }} />
            <div style={{ position: "absolute", left: "18%", top: "5%", width: "38%", height: "80%", borderRadius: "50%", background: "#fff" }} />
            <div style={{ position: "absolute", left: "44%", top: "-12%", width: "34%", height: "95%", borderRadius: "50%", background: "#fff" }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
}
