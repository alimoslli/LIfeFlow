import { interpolate, useCurrentFrame } from "remotion";
import { F } from "./fonts";
import { prog, rng, useLayout, useSpring } from "./util";

/** Game-style HUD pieces (original designs, no game's own fonts or marks). */

/** Cash in the corner, counting from `from` to `to` between frames a..b, green if it goes up and red if down. */
export function CashCounter({ from, to, a, b }: { from: number; to: number; a: number; b: number }) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const v = interpolate(frame, [a, b], [from, to], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const moving = frame >= a && frame <= b + 20;
  const up = to >= from;
  return (
    <div style={{ position: "absolute", right: L.safe.side, top: L.safe.top * 0.7, textAlign: "right", fontFamily: F.ui, fontWeight: 700, fontStyle: "italic", letterSpacing: "0.02em" }}>
      <div style={{ fontSize: 64 * L.u, color: moving ? (up ? "#7be0a6" : "#ff8f7a") : "#e9f2e4", WebkitTextStroke: `${5 * L.u}px #06120c`, paintOrder: "stroke fill" }}>${Math.round(v).toLocaleString("en-US")}</div>
      {moving && <div style={{ fontSize: 40 * L.u, color: up ? "#7be0a6" : "#ff8f7a", WebkitTextStroke: `${4 * L.u}px #06120c`, paintOrder: "stroke fill" }}>{up ? "+" : "-"}${Math.abs(Math.round(to - from)).toLocaleString("en-US")}</div>}
    </div>
  );
}
/** A small round map with a route and a blinking target, bottom left. */
export function MiniMap({ seed = 3, target = "#ffd77a" }: { seed?: number; target?: string }) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const r = rng(seed);
  const s = 300 * L.u;
  const roads = Array.from({ length: 9 }, () => ({ x: r() * s, y: r() * s, w: 6 + r() * 10, l: 80 + r() * 220, h: r() > 0.5 }));
  const rot = frame * 0.15;
  return (
    <div style={{ position: "absolute", left: L.safe.side, bottom: L.safe.bottom * 0.55, width: s, height: s, borderRadius: "50%", overflow: "hidden", border: `${6 * L.u}px solid rgb(10 14 24 / 0.85)`, background: "#3d4a3a", boxShadow: "0 10px 30px rgb(0 0 0 / 0.4)" }}>
      <div style={{ position: "absolute", inset: 0, transform: `rotate(${rot}deg)` }}>
        {roads.map((d, i) => (
          <div key={i} style={{ position: "absolute", left: d.x, top: d.y, width: d.h ? d.l * L.u : d.w * L.u, height: d.h ? d.w * L.u : d.l * L.u, background: "#9aa39a" }} />
        ))}
        <div style={{ position: "absolute", left: s * 0.68, top: s * 0.22, width: 26 * L.u, height: 26 * L.u, borderRadius: "50%", background: target, opacity: 0.5 + 0.5 * Math.sin(frame / 4) }} />
      </div>
      <div style={{ position: "absolute", left: s / 2 - 14 * L.u, top: s / 2 - 16 * L.u, width: 0, height: 0, borderLeft: `${14 * L.u}px solid transparent`, borderRight: `${14 * L.u}px solid transparent`, borderBottom: `${32 * L.u}px solid #fff` }} />
    </div>
  );
}
/** A big mission title card that slams in with stripes, holds, and leaves. */
export function MissionCard({ at, hold = 60, kicker, title, color = "#ffd77a" }: { at: number; hold?: number; kicker: string; title: string; color?: string }) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const s = useSpring(at, { damping: 11, stiffness: 180 });
  const out = prog(frame, at + hold, at + hold + 10);
  if (frame < at) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: L.height * 0.36, height: 300 * L.u, transform: `skewY(-4deg) scaleY(${s})`, opacity: 1 - out }}>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgb(8 10 18 / 0) 0%, rgb(8 10 18 / 0.88) 18%, rgb(8 10 18 / 0.88) 82%, rgb(8 10 18 / 0) 100%)" }} />
      <div style={{ position: "absolute", left: 0, right: 0, top: 18 * L.u, height: 6 * L.u, background: color, transform: `scaleX(${s})` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 18 * L.u, height: 6 * L.u, background: color, transform: `scaleX(${s})` }} />
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: F.ui, fontStyle: "italic", textTransform: "uppercase" }}>
        <div style={{ fontSize: 40 * L.u, fontWeight: 600, letterSpacing: "0.32em", color }}>{kicker}</div>
        <div style={{ fontSize: 100 * L.u, fontWeight: 700, color: "#fff", letterSpacing: "0.01em", transform: `translateX(${(1 - s) * -120}px)`, textAlign: "center", lineHeight: 1 }}>{title}</div>
      </div>
    </div>
  );
}
/** The objective line along the bottom, with one word picked out in gold. */
export function Objective({ at, text, mark }: { at: number; text: string; mark?: string }) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const p = prog(frame, at, at + 8);
  if (frame < at) return null;
  return (
    <div style={{ position: "absolute", left: L.safe.side, right: L.safe.side, bottom: L.safe.bottom * 0.55 + 340 * L.u, textAlign: "center", fontFamily: F.ui, fontWeight: 600, fontSize: 46 * L.u, color: "#fff", opacity: p, WebkitTextStroke: `${6 * L.u}px #070a12`, paintOrder: "stroke fill" }}>
      {text.split(" ").map((w, i) => (
        <span key={i} style={{ color: mark && w.toLowerCase().includes(mark.toLowerCase()) ? "#ffd77a" : undefined }}>
          {w}{" "}
        </span>
      ))}
    </div>
  );
}

/** Cutscene subtitles: the speaker in gold capitals, the line in white, timed in seconds within the scene. */
export function GameSubtitles({ lines }: { lines: { who: string; text: string; s: number; e: number }[] }) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const t = frame / L.fps;
  const cur = lines.find((l) => t >= l.s && t <= l.e);
  if (!cur) return null;
  const a = Math.min(1, (t - cur.s) / 0.12, (cur.e - t) / 0.12);
  return (
    <div style={{ position: "absolute", left: L.safe.side, right: L.safe.side, bottom: L.safe.bottom * 0.55 + 340 * L.u, textAlign: "center", fontFamily: F.ui, fontWeight: 600, fontSize: 46 * L.u, lineHeight: 1.3, color: "#fff", opacity: a, textShadow: "0 2px 6px rgb(0 0 0 / 0.9), 0 0 2px #000" }}>
      <span style={{ color: "#ffd77a", letterSpacing: "0.06em" }}>{cur.who.toUpperCase()}:</span> {cur.text}
    </div>
  );
}
