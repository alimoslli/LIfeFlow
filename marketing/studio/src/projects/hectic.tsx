import { AbsoluteFill, OffthreadVideo, staticFile, useCurrentFrame } from "remotion";
import { BrandOutro, F, Fade, GameSubtitles, Grain, MiniMap, prog, useLayout } from "../kit";
import type { Project } from "./types";

/**
 * "Hectic": an open-world crime game look with ORIGINAL characters (Cruz and Leana) in an invented city. Two MAGI-2
 * cutscenes (a chase at 5:40 PM, a van outside a casino at 7:58 PM) around the real LifeFlow Today screen of Cruz's
 * demo profile at 5:40 PM. The HUD is the studio's own design. Audio (the clips' voices and effects, original music)
 * is mixed afterwards by hectic-mix.sh.
 */

/** The hook: fully visible from the first frame, gone by 3.4 s. */
function Hook() {
  const f = useCurrentFrame();
  const L = useLayout();
  const out = prog(f, 3.0 * L.fps, 3.4 * L.fps);
  const lines: [string, string?][] = [["Their day:"], ["a car chase,"], ["dinner at ", "6"], ["a casino job at ", "8"]];
  return (
    <div
      style={{
        position: "absolute",
        left: L.safe.side,
        right: L.safe.side,
        top: L.safe.top * 0.9 + 70 * L.u,
        textAlign: "center",
        fontFamily: F.ui,
        fontWeight: 700,
        fontStyle: "italic",
        fontSize: 84 * L.u,
        lineHeight: 1.08,
        color: "#fff",
        WebkitTextStroke: `${10 * L.u}px #070a12`,
        paintOrder: "stroke fill",
        opacity: 1 - out,
        transform: `translateY(${-out * 30 * L.u}px)`,
      }}
    >
      {lines.map(([a, b], i) => (
        <div key={i}>
          {a}
          {b && <span style={{ color: "#ffd77a" }}>{b}</span>}
        </div>
      ))}
    </div>
  );
}

/** The in-game clock, top right. */
function Clock({ time }: { time: string }) {
  const L = useLayout();
  return (
    <div style={{ position: "absolute", right: L.safe.side, top: L.safe.top * 0.7, fontFamily: F.ui, fontWeight: 700, fontStyle: "italic", fontSize: 58 * L.u, color: "#fff", WebkitTextStroke: `${5 * L.u}px #070a12`, paintOrder: "stroke fill", letterSpacing: "0.02em" }}>
      {time}
    </div>
  );
}

/** One cutscene: the clip, the HUD and the subtitles. */
function Cutscene({ file, from, time, lines, hook = false, zoom = 1 }: { file: string; from: number; time: string; lines: { who: string; text: string; s: number; e: number }[]; hook?: boolean; zoom?: number }) {
  const L = useLayout();
  return (
    <AbsoluteFill style={{ background: "#000" }}>
      <OffthreadVideo src={staticFile(file)} startFrom={Math.round(from * L.fps)} muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${zoom})`, transformOrigin: "50% 0%" }} />
      <Clock time={time} />
      <MiniMap seed={hook ? 3 : 7} />
      <GameSubtitles lines={lines} />
      {hook && <Hook />}
      <Grain amount={0.04} vignette={0.25} />
    </AbsoluteFill>
  );
}

function Chase() {
  return (
    <Cutscene
      file="generated/hectic/chase.mp4"
      from={0.12}
      time="5:40 PM"
      hook
      lines={[
        { who: "Cruz", text: "We have dinner at six.", s: 3.73, e: 5.5 },
        { who: "Leana", text: "We're a little busy!", s: 6.73, e: 8.4 },
      ]}
    />
  );
}

/** The real LifeFlow Today screen from Cruz's demo profile at 5:40 PM, full screen, with a slow push. */
function AppDay() {
  const f = useCurrentFrame();
  const L = useLayout();
  const s = 1 + 0.035 * prog(f, 0, 5 * L.fps);
  const flash = 1 - prog(f, 0, 6);
  const cap = prog(f, 0.6 * L.fps, 1.0 * L.fps);
  const w = L.width;
  const h = (w * 2532) / 1170;
  return (
    <AbsoluteFill style={{ background: "#f4f5fa" }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, transform: `scale(${s})`, transformOrigin: "50% 30%" }}>
        <OffthreadVideo src={staticFile("captures/cruz-hectic/today.mp4")} muted style={{ width: "100%", height: "100%" }} />
      </div>
      <div style={{ position: "absolute", left: L.safe.side, right: L.safe.side, top: 1650 * L.u, textAlign: "center", fontFamily: F.display, fontWeight: 700, fontSize: 60 * L.u, lineHeight: 1.15, color: "#0f1b33", opacity: cap, transform: `translateY(${(1 - cap) * 20 * L.u}px)` }}>
        Dinner at 6. The job at 8.
        <br />
        <span style={{ color: "#b3630a" }}>Even the group chat.</span>
      </div>
      <AbsoluteFill style={{ background: "#fff", opacity: flash }} />
    </AbsoluteFill>
  );
}

function Casino() {
  return (
    <Fade inF={0} outF={6}>
      <Cutscene
        file="generated/hectic/casino.mp4"
        from={0.2}
        zoom={1.07}
        time="7:58 PM"
        lines={[
          { who: "Cruz", text: "Eight o'clock. Right on time.", s: 2.1, e: 4.2 },
          { who: "Leana", text: "Who are you, and what did you do with Cruz?", s: 5.3, e: 7.8 },
          { who: "Cruz", text: "LifeFlow.", s: 8.9, e: 9.8 },
        ]}
      />
    </Fade>
  );
}

function Outro() {
  return <BrandOutro line="If it works for them, it'll work for you." gold="you." minute={20 * 60} />;
}

export const hectic: Project = {
  id: "hectic",
  title: "Hectic (Cruz and Leana)",
  concept:
    "An open-world crime game look with original characters: a car chase at 5:40, but dinner's at 6; the real LifeFlow day; outside the casino at 7:58, right on time. 'Who are you, and what did you do with Cruz?' 'LifeFlow.'",
  formats: ["9x16"],
  captures: ["cruz-hectic/today"],
  // placeholder bed so the render script can mux; the real sound is made by projects/hectic/hectic-mix.sh
  music: { file: "audio/hectic_music.mp3", gain: -20 },
  scenes: [
    { id: "chase", title: "5:40 PM, the chase", seconds: 8.6, mode: "hybrid", why: "Game-look people and a city: MAGI-2 footage, HUD and text in code.", estimate: { credits: 25, model: "magi_2" }, component: Chase },
    { id: "app", title: "Cruz's real day", seconds: 4.6, mode: "code", why: "The real app screen, filmed from the app.", component: AppDay },
    { id: "casino", title: "7:58 PM, right on time", seconds: 9.8, mode: "hybrid", why: "The payoff line needs real faces and voices.", estimate: { credits: 25, model: "magi_2" }, component: Casino },
    { id: "outro", title: "Sign-off", seconds: 3.6, mode: "code", why: "Brand ending from the app's own skylings.", component: Outro },
  ],
};
