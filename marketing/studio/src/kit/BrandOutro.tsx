import { AbsoluteFill, Img, staticFile } from "remotion";
import { COMPANION_KEYS, type CompanionKey } from "../app-bridge";
import { F } from "./fonts";
import { PixelSkyling } from "./PixelSkyling";
import { Sky } from "./Sky";
import { prog, useLayout, useSpring } from "./util";
import { useCurrentFrame } from "remotion";

/** The LifeFlow sign-off: the real mark, the name, one line, the five skylings (or the ones you pass), the web address. */
export function BrandOutro({ line = "Let's clear your sky.", gold = "sky.", cast = [...COMPANION_KEYS], minute = 21 * 60, url = "lifeflowweb.com" }: { line?: string; gold?: string; cast?: CompanionKey[]; minute?: number; url?: string }) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const mark = useSpring(4, { damping: 12 });
  const words = line.split(" ");
  return (
    <AbsoluteFill>
      <Sky minute={minute} clouds={0} sun={false} />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 * L.u, fontFamily: F.display, color: "#fff" }}>
        <Img src={staticFile("app-brand/lifeflow-mark-transparent-512.png")} style={{ width: 190 * L.u, transform: `scale(${mark})` }} />
        <div style={{ fontSize: 84 * L.u, fontWeight: 700, opacity: prog(frame, 10, 20) }}>LifeFlow</div>
        <div style={{ fontSize: 66 * L.u, fontWeight: 600, display: "flex", gap: 16 * L.u, flexWrap: "wrap", justifyContent: "center", padding: `0 ${L.safe.side}px` }}>
          {words.map((w, i) => (
            <span key={i} style={{ opacity: prog(frame, 18 + i * 3, 30 + i * 3), color: w === gold ? "#ffd77a" : "#fff" }}>
              {w}
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 18 * L.u, marginTop: 20 * L.u }}>
          {cast.map((k, i) => {
            const s = prog(frame, 30 + i * 4, 42 + i * 4);
            return <PixelSkyling key={k} who={k} scale={Math.round(7 * L.u)} pose={s >= 1 ? "celebrate" : "idle"} night={(minute > 18 * 60 || minute < 6 * 60) && (k === "star" || k === "moon")} style={{ opacity: s, transform: `translateY(${(1 - s) * 40}px)` }} />;
          })}
        </div>
        <div style={{ fontFamily: F.ui, fontSize: 34 * L.u, opacity: 0.75 * prog(frame, 50, 60) }}>{url}</div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
