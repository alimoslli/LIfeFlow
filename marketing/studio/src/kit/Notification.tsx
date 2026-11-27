import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { F } from "./fonts";
import { useLayout, useSpring } from "./util";

/** A lock-screen style push from LifeFlow (the app's real mark), dropping in at `at` and leaving after `hold` frames. */
export function Notification({ at, hold = 75, title, body, y, app = "LifeFlow", when = "now", dark = true }: { at: number; hold?: number; title: string; body: string; y?: number; app?: string; when?: string; dark?: boolean }) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const inS = useSpring(at, { damping: 16, stiffness: 160 });
  const outP = interpolate(frame, [at + hold, at + hold + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (frame < at - 1) return null;
  const w = Math.min(L.width - L.safe.side * 2, 920 * L.u);
  return (
    <div
      style={{
        position: "absolute",
        left: (L.width - w) / 2,
        width: w,
        top: (y ?? L.safe.top) + (inS - 1) * 220 * L.u - outP * 260 * L.u,
        opacity: Math.min(1, inS * 1.5) * (1 - outP),
        borderRadius: 34 * L.u,
        padding: `${26 * L.u}px ${30 * L.u}px`,
        background: dark ? "rgb(28 31 40 / 0.78)" : "rgb(250 250 252 / 0.86)",
        backdropFilter: "blur(24px) saturate(1.6)",
        boxShadow: "0 20px 60px rgb(0 0 0 / 0.35)",
        color: dark ? "#fff" : "#0f1a2a",
        fontFamily: F.ui,
        display: "flex",
        gap: 22 * L.u,
        alignItems: "flex-start",
      }}
    >
      <Img src={staticFile("app-brand/lifeflow-mark-192.png")} style={{ width: 78 * L.u, height: 78 * L.u, borderRadius: 18 * L.u, flex: "none" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 * L.u, opacity: 0.6, fontWeight: 500 }}>
          <span>{app.toUpperCase()}</span>
          <span>{when}</span>
        </div>
        <div style={{ fontSize: 34 * L.u, fontWeight: 700, marginTop: 4 * L.u }}>{title}</div>
        <div style={{ fontSize: 31 * L.u, fontWeight: 400, opacity: 0.92, lineHeight: 1.25, marginTop: 2 * L.u }}>{body}</div>
      </div>
    </div>
  );
}
