import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { BrandOutro, F, Grain, prog, useLayout } from "../kit";
import type { Project } from "./types";

/**
 * "The Gate": a modern open-world crime game look with ORIGINAL characters (Cruz and Leana) in an invented city.
 * Thursday night, a getaway at a garage exit card reader; two days earlier, his real LifeFlow app warned him he could
 * run out of money around Thursday, he set a to-do and ticked it off. The card goes through. Every app screen is the real
 * app (demo profile cruz-gate, filmed with the server clock at each moment) pinned onto his phone by phone_screen.py.
 * The HUD is our own design. Sound: projects/the-gate/mix.sh.
 */

const GOLD = "#f3c46a";
type Line = { who: string; text: string; s: number; e: number; top?: boolean };

function Subs({ lines }: { lines: Line[] }) {
  const f = useCurrentFrame();
  const L = useLayout();
  const t = f / L.fps;
  const cur = lines.find((l) => t >= l.s && t <= l.e);
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: L.height * 0.3, background: "linear-gradient(180deg, rgb(0 0 0 / 0), rgb(0 0 0 / 0.45))" }} />
      {cur && (
        <div style={{ position: "absolute", left: L.safe.side, right: L.safe.side, ...(cur.top ? { top: L.safe.top * 0.75 + 170 * L.u } : { bottom: L.safe.bottom * 0.55 + 150 * L.u }), textAlign: "center", opacity: Math.min(1, (t - cur.s) / 0.1, (cur.e - t) / 0.1) }}>
          <div style={{ fontFamily: F.hud, fontWeight: 600, fontSize: 24 * L.u, letterSpacing: "0.32em", color: GOLD, marginBottom: 8 * L.u, textShadow: "0 2px 8px rgb(0 0 0 / 0.8)" }}>{cur.who.toUpperCase()}</div>
          <div style={{ fontFamily: F.hud, fontWeight: 600, fontSize: 50 * L.u, lineHeight: 1.2, color: "#fff", textShadow: "0 2px 10px rgb(0 0 0 / 0.85), 0 0 2px rgb(0 0 0 / 0.9)" }}>{cur.text}</div>
        </div>
      )}
    </>
  );
}

/** Day and time, top right, in the HUD type. */
function When({ day, time }: { day: string; time: string }) {
  const L = useLayout();
  return (
    <div style={{ position: "absolute", right: L.safe.side * 0.7, top: L.safe.top * 0.75, textAlign: "right", fontFamily: F.hud, textShadow: "0 2px 10px rgb(0 0 0 / 0.6)" }}>
      <div style={{ fontWeight: 600, fontSize: 22 * L.u, letterSpacing: "0.3em", color: GOLD }}>{day}</div>
      <div style={{ fontWeight: 600, fontSize: 38 * L.u, color: "#fff", letterSpacing: "0.04em" }}>{time}</div>
    </div>
  );
}

/** The hook line, on screen from the first frame. */
function Hook() {
  const f = useCurrentFrame();
  const L = useLayout();
  const out = prog(f, 2.6 * L.fps, 3.1 * L.fps);
  return (
    <div style={{ position: "absolute", left: L.safe.side, right: L.safe.side, top: L.height * 0.2, textAlign: "center", opacity: 1 - out }}>
      <div style={{ fontFamily: F.mission, fontStretch: "75%", fontWeight: 800, fontSize: 112 * L.u, lineHeight: 0.98, color: "#fff", textShadow: "0 6px 30px rgb(0 0 0 / 0.7)" }}>
        THE MOST DANGEROUS
        <br />
        PART OF THE <span style={{ color: GOLD }}>JOB.</span>
      </div>
    </div>
  );
}

/** A status tag next to the card reader (the device screen itself stays blank in the footage). */
function ReaderTag({ text, color, at, until }: { text: string; color: string; at: number; until?: number }) {
  const f = useCurrentFrame();
  const L = useLayout();
  const t = f / L.fps;
  if (t < at || (until !== undefined && t > until)) return null;
  const p = prog(f, at * L.fps, (at + 0.2) * L.fps);
  const blink = text.endsWith("...") ? 0.65 + 0.35 * Math.sin(f / 3) : 1;
  return (
    <div style={{ position: "absolute", left: L.safe.side * 0.7, top: L.height * 0.5, opacity: p * blink, fontFamily: F.hud, fontWeight: 700, fontSize: 34 * L.u, letterSpacing: "0.22em", color, padding: `${10 * L.u}px ${18 * L.u}px`, background: "rgb(6 9 16 / 0.6)", borderLeft: `${5 * L.u}px solid ${color}`, borderRadius: 4 * L.u }}>
      {text}
    </div>
  );
}

/** "TWO DAYS EARLIER" style card over the start of a shot. */
function Jump({ top, bottom, at, dur = 1.1 }: { top: string; bottom: string; at: number; dur?: number }) {
  const f = useCurrentFrame();
  const L = useLayout();
  const t = f / L.fps;
  if (t < at || t > at + dur) return null;
  const a = Math.min(1, (t - at) / 0.12, (at + dur - t) / 0.2);
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", background: `rgb(4 6 12 / ${0.55 * a})` }}>
      <div style={{ textAlign: "center", opacity: a }}>
        <div style={{ fontFamily: F.hud, fontWeight: 600, fontSize: 30 * L.u, letterSpacing: "0.4em", color: GOLD }}>{top}</div>
        <div style={{ fontFamily: F.mission, fontStretch: "75%", fontWeight: 800, fontSize: 120 * L.u, color: "#fff", lineHeight: 1 }}>{bottom}</div>
      </div>
    </AbsoluteFill>
  );
}

function Shot({ file, children }: { file: string; children?: React.ReactNode }) {
  const f = useCurrentFrame();
  const flash = 1 - prog(f, 0, 5);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <OffthreadVideo src={staticFile(file)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <Grain amount={0.03} vignette={0.22} />
      {children}
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.3 }} />
    </AbsoluteFill>
  );
}

// subtitle timings come from the shots' own audio (see projects/the-gate/README.md)
const G1 = () => (
  <Shot file="generated/gate/g1.mp4">
    <Subs lines={[{ who: "Leana", text: "If your card declines, we're walking.", s: 3.1, e: 4.9 }, { who: "Cruz", text: "It won't.", s: 5.3, e: 6.1 }, { who: "Leana", text: "You checked?", s: 6.9, e: 7.6 }, { who: "Cruz", text: "Tuesday.", s: 8.1, e: 9.0 }]} />
    <ReaderTag text="PROCESSING..." color="#f3b45a" at={0.2} />
    <When day="THURSDAY" time="11:52 PM" />
    <Hook />
  </Shot>
);
const G2 = () => (
  <Shot file="generated/gate/g2.mp4">
    <Subs lines={[{ who: "Cruz", text: "Three hundred from savings. Tomorrow, nine.", s: 1.0, e: 3.3, top: true }]} />
    <When day="TUESDAY" time="10:30 AM" />
    <Jump top="TWO DAYS EARLIER" bottom="TUESDAY" at={0} dur={1.0} />
  </Shot>
);
const G3 = () => (
  <Shot file="generated/gate/g3.mp4">
    <Subs lines={[{ who: "Cruz", text: "Told you.", s: 2.0, e: 3.0 }, { who: "Leana", text: "You told me nothing.", s: 3.4, e: 5.0 }]} />
    <ReaderTag text="PROCESSING..." color="#f3b45a" at={0} until={1.0} />
    <ReaderTag text="APPROVED" color="#7ee2a8" at={1.0} />
    <When day="THURSDAY" time="11:53 PM" />
  </Shot>
);
const Outro = () => <BrandOutro line="It saw Thursday on Tuesday." gold="Tuesday." minute={23 * 60} />;

export const theGate: Project = {
  id: "the-gate",
  title: "The Gate (Cruz and Leana)",
  concept:
    "Thursday night, a getaway at a garage exit card reader: 'If your card declines, we're walking.' 'Tuesday.' Two days earlier his real LifeFlow app warned he could run out of money around Thursday; he set a to-do and ticked it off. APPROVED. 'You told me nothing.'",
  formats: ["9x16"],
  captures: ["gate-tue/money", "gate-tue/todos", "gate-wed/tick"],
  // placeholder bed so the render script can mux; the real sound is made by projects/the-gate/mix.sh
  music: { file: "audio/olj_music.mp3", gain: -20 },
  scenes: [
    { id: "g1", title: "Thursday 11:52 PM, the gate", seconds: 9.0, mode: "hybrid", why: "The hook needs a real game-look night and real faces.", estimate: { credits: 63, model: "seedance_2_5 720p" }, component: G1 },
    { id: "g2", title: "Tuesday, the heads-up and the tick", seconds: 9.0, mode: "hybrid", why: "The real app on his phone, his skyling beside him.", estimate: { credits: 63, model: "seedance_2_5 720p" }, component: G2 },
    { id: "g3", title: "Thursday 11:53 PM, approved", seconds: 9.0, mode: "hybrid", why: "The payoff on the same gate.", estimate: { credits: 63, model: "seedance_2_5 720p" }, component: G3 },
    { id: "outro", title: "Sign-off", seconds: 3.5, mode: "code", why: "Brand ending with the app's own skylings.", component: Outro },
  ],
};
