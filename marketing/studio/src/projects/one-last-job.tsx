import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { BrandOutro, F, Grain, prog, useLayout } from "../kit";
import type { Project } from "./types";

/**
 * "One Last Job": a modern open-world crime game look with ORIGINAL characters (Cruz and Leana) in an invented city
 * (Port Solana). Cruz's real LifeFlow day drives the mission: every objective on screen is the next thing in his real
 * app, and in the first-person shots the real app is pinned onto the phone in his hand (scripts/phone_screen.py).
 * The HUD is our own design (no game's fonts, marks or phrases). Sound is mixed by projects/one-last-job/mix.sh.
 */

const GOLD = "#f3c46a";
type Line = { who: string; text: string; s: number; e: number; top?: boolean; high?: boolean };

/** Big mission title on the first frame, then it shrinks away. */
function MissionTitle() {
  const f = useCurrentFrame();
  const L = useLayout();
  const out = prog(f, 2.3 * L.fps, 2.9 * L.fps);
  const bar = prog(f, 4, 16);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: L.height * 0.17, textAlign: "center", opacity: 1 - out, transform: `translateY(${-out * 40 * L.u}px) scale(${1 - out * 0.08})` }}>
      <div style={{ fontFamily: F.hud, fontWeight: 600, fontSize: 30 * L.u, letterSpacing: "0.42em", color: GOLD, textShadow: "0 2px 12px rgb(0 0 0 / 0.6)" }}>MISSION</div>
      <div style={{ fontFamily: F.mission, fontStretch: "75%", fontWeight: 800, fontSize: 168 * L.u, lineHeight: 0.95, color: "#fff", letterSpacing: "0.01em", textShadow: "0 6px 30px rgb(0 0 0 / 0.55)" }}>ONE LAST JOB</div>
      <div style={{ margin: `${18 * L.u}px auto 0`, width: 360 * L.u * bar, height: 4 * L.u, background: GOLD, borderRadius: 2 }} />
      <div style={{ marginTop: 18 * L.u, fontFamily: F.hud, fontWeight: 500, fontSize: 32 * L.u, letterSpacing: "0.12em", color: "rgb(255 255 255 / 0.9)", textShadow: "0 2px 10px rgb(0 0 0 / 0.7)" }}>PORT SOLANA · 8:10 AM</div>
    </div>
  );
}

/** Top-left objective, taken from the next thing in his real app; ticks when it's done. */
function Objective({ text, at, doneAt }: { text: string; at: number; doneAt?: number }) {
  const f = useCurrentFrame();
  const L = useLayout();
  const t = f / L.fps;
  if (t < at) return null;
  const inP = prog(f, at * L.fps, (at + 0.35) * L.fps);
  const done = doneAt !== undefined && t >= doneAt;
  const dP = doneAt !== undefined ? prog(f, doneAt * L.fps, (doneAt + 0.3) * L.fps) : 0;
  return (
    <div style={{ position: "absolute", left: L.safe.side * 0.7, top: L.safe.top * 0.75, opacity: inP, transform: `translateX(${(1 - inP) * -30 * L.u}px)`, display: "flex", gap: 18 * L.u, alignItems: "stretch", padding: `${16 * L.u}px ${44 * L.u}px ${16 * L.u}px ${18 * L.u}px`, background: "linear-gradient(90deg, rgb(6 9 16 / 0.62), rgb(6 9 16 / 0.35) 70%, rgb(6 9 16 / 0))", borderRadius: 6 * L.u }}>
      <div style={{ width: 5 * L.u, borderRadius: 3, background: done ? "#7ee2a8" : GOLD }} />
      <div>
        <div style={{ fontFamily: F.hud, fontWeight: 600, fontSize: 22 * L.u, letterSpacing: "0.3em", color: done ? "#7ee2a8" : GOLD }}>{done ? "COMPLETE" : "OBJECTIVE"}</div>
        <div style={{ fontFamily: F.hud, fontWeight: 600, fontSize: 38 * L.u, color: "#fff", marginTop: 4 * L.u, display: "flex", alignItems: "center", gap: 12 * L.u, textShadow: "0 2px 8px rgb(0 0 0 / 0.5)" }}>
          {done && (
            <span style={{ display: "inline-block", width: 30 * L.u, height: 30 * L.u, borderRadius: "50%", background: "#7ee2a8", color: "#0b1a12", fontSize: 22 * L.u, lineHeight: `${30 * L.u}px`, textAlign: "center", transform: `scale(${0.6 + 0.4 * dP})` }}>✓</span>
          )}
          <span style={{ opacity: done ? 0.85 : 1 }}>{text}</span>
        </div>
      </div>
    </div>
  );
}

/** In-game clock, top right. */
function Clock({ time, night = false }: { time: string; night?: boolean }) {
  const L = useLayout();
  return (
    <div style={{ position: "absolute", right: L.safe.side * 0.7, top: L.safe.top * 0.75 + 14 * L.u, display: "flex", alignItems: "center", gap: 12 * L.u, fontFamily: F.hud, fontWeight: 600, fontSize: 34 * L.u, letterSpacing: "0.06em", color: "#fff", textShadow: "0 2px 10px rgb(0 0 0 / 0.6)" }}>
      <span style={{ width: 16 * L.u, height: 16 * L.u, borderRadius: "50%", background: night ? "#cfd8ff" : GOLD, boxShadow: `0 0 ${12 * L.u}px ${night ? "#9fb2ff" : GOLD}` }} />
      {time}
    </div>
  );
}

/** Subtitles: the speaker in gold capitals, the line in white, over a soft shade at the bottom. */
function Subs({ lines }: { lines: Line[] }) {
  const f = useCurrentFrame();
  const L = useLayout();
  const t = f / L.fps;
  const cur = lines.find((l) => t >= l.s && t <= l.e);
  return (
    <>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: L.height * 0.3, background: "linear-gradient(180deg, rgb(0 0 0 / 0), rgb(0 0 0 / 0.42))" }} />
      {cur && (
        <div style={{ position: "absolute", left: L.safe.side, right: L.safe.side, ...(cur.high ? { top: L.safe.top * 0.75 } : cur.top ? { top: L.safe.top * 0.75 + 190 * L.u } : { bottom: L.safe.bottom * 0.55 + 150 * L.u }), textAlign: "center", opacity: Math.min(1, (t - cur.s) / 0.1, (cur.e - t) / 0.1) }}>
          <div style={{ fontFamily: F.hud, fontWeight: 600, fontSize: 24 * L.u, letterSpacing: "0.32em", color: GOLD, marginBottom: 8 * L.u, textShadow: "0 2px 8px rgb(0 0 0 / 0.8)" }}>{cur.who.toUpperCase()}</div>
          <div style={{ fontFamily: F.hud, fontWeight: 600, fontSize: 48 * L.u, lineHeight: 1.22, color: "#fff", textShadow: "0 2px 10px rgb(0 0 0 / 0.85), 0 0 2px rgb(0 0 0 / 0.9)" }}>{cur.text}</div>
        </div>
      )}
    </>
  );
}

function Shot({ file, from = 0, time, night, lines, objective, children }: { file: string; from?: number; time: string; night?: boolean; lines: Line[]; objective?: { text: string; at: number; doneAt?: number }; children?: React.ReactNode }) {
  const L = useLayout();
  const f = useCurrentFrame();
  const flash = 1 - prog(f, 0, 5);
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <OffthreadVideo src={staticFile(file)} startFrom={Math.round(from * L.fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      <Grain amount={0.03} vignette={0.22} />
      <Subs lines={lines} />
      {objective && <Objective {...objective} />}
      <Clock time={time} night={night} />
      {children}
      <AbsoluteFill style={{ background: "#fff", opacity: flash * 0.35 }} />
    </AbsoluteFill>
  );
}

const S1 = () => (
  <Shot file="generated/olj/s1.mp4" time="8:10 AM" lines={[{ who: "Cruz", text: "Almost a million.", s: 2.15, e: 3.25, high: true }, { who: "Cruz", text: "One more job.", s: 3.7, e: 5.0, high: true }]} objective={{ text: "Pick up the car · 11:00 AM", at: 5.5 }}>
    <MissionTitle />
  </Shot>
);
const S2 = () => (
  <Shot file="generated/olj/s2.mp4" time="11:00 AM" lines={[{ who: "Leana", text: "You're... on time?", s: 3.95, e: 5.6 }, { who: "Cruz", text: "I'm a professional.", s: 5.8, e: 7.6 }]} objective={{ text: "Pick up the car", at: 0.2, doneAt: 7.7 }} />
);
const S3 = () => (
  <Shot
    file="generated/olj/s3.mp4"
    time="2:30 PM"
    lines={[{ who: "Leana", text: "Who's Lorenza?", s: 4.5, e: 5.5 }, { who: "Cruz", text: "The getaway driver.", s: 5.95, e: 7.3 }, { who: "Leana", text: "I'm the getaway driver.", s: 8.5, e: 9.95 }]}
    objective={{ text: "Send Lorenza $50,000", at: 0.2, doneAt: 1.75 }}
  />
);
const S4 = () => (
  <Shot file="generated/olj/s4.mp4" time="6:00 PM" lines={[{ who: "Leana", text: "Okay. Who are you, and what did you do with Cruz?", s: 0.5, e: 4.2 }]} objective={{ text: "Dinner with Leana · 6:00 PM", at: 0.2, doneAt: 5.0 }} />
);
const S5 = () => (
  <Shot file="generated/olj/s5.mp4" time="7:58 PM" night lines={[{ who: "Cruz", text: "Right on time.", s: 1.1, e: 2.2, top: true }, { who: "Leana", text: "...Can I get this?", s: 7.9, e: 8.95 }]} objective={{ text: "Casino job · 8:00 PM", at: 0.2 }} />
);
const Outro = () => <BrandOutro line="Even their day has a plan." gold="plan." minute={21 * 60} />;

export const oneLastJob: Project = {
  id: "one-last-job",
  title: "One Last Job (Cruz and Leana)",
  concept:
    "A modern open-world crime game look with original characters. Cruz is almost a millionaire with one more job, and his real LifeFlow day runs the mission: net worth at sunrise, the car at 11, ticking off 'Send Lorenza $50,000', dinner at 6, the casino at 8. 'Can I get this?'",
  formats: ["9x16"],
  captures: ["cruz-morning/networth", "cruz-morning/today", "cruz-noon/tick", "cruz-night/today"],
  // placeholder bed so the render script can mux; the real sound is made by projects/one-last-job/mix.sh
  music: { file: "audio/olj_music.mp3", gain: -20 },
  scenes: [
    { id: "s1", title: "8:10 AM, balcony (first person)", seconds: 8.05, mode: "hybrid", why: "Game-look world from MAGI-2, the real app pinned on his phone.", estimate: { credits: 20, model: "magi_2" }, component: S1 },
    { id: "s2", title: "11:00 AM, the car (third person)", seconds: 8.9, mode: "hybrid", why: "Gameplay camera and dialogue need real motion and faces.", estimate: { credits: 22.5, model: "magi_2" }, component: S2 },
    { id: "s3", title: "2:30 PM, passenger seat (first person)", seconds: 10, mode: "hybrid", why: "The real tick-off on his phone while Leana drives.", estimate: { credits: 25, model: "magi_2" }, component: S3 },
    { id: "s4", title: "6:00 PM, the diner", seconds: 7.5, mode: "hybrid", why: "The reveal needs a real face.", estimate: { credits: 22.5, model: "magi_2" }, component: S4 },
    { id: "s5", title: "7:58 PM, the casino (first person)", seconds: 9.0, mode: "hybrid", why: "The real night screen in his hand, Leana's last line.", estimate: { credits: 22.5, model: "magi_2" }, component: S5 },
    { id: "outro", title: "Sign-off", seconds: 3.5, mode: "code", why: "Brand ending from the app's own skylings.", component: Outro },
  ],
};
