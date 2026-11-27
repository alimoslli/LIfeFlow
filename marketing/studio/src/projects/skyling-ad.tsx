import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COMPANION_KEYS, SUN, companionOf, skylingAt, type CompanionKey } from "../app-bridge";
import { BrandOutro, F, Fade, Grain, KineticTitle, Sky, Stage3D, VoxelSkyling, prog, useLayout } from "../kit";
import type { Project } from "./types";

/** POC 2, a skyling ad: the five skylings as 3D toys built at render time from the app's own pixel art. */
const HOURS: Record<CompanionKey, string> = { dawn: "first light", ray: "the day", goldie: "golden hour", star: "after sunset", moon: "the night" };
const Hook = () => {
  const L = useLayout();
  return (
    <Fade inF={0}>
      <Sky minute={5 * 60 + 50} clouds={0} sun={false} />
      <KineticTitle text="Someone's always up." gold={["up."]} size={110} y={L.height * 0.4} />
      <Grain />
    </Fade>
  );
};
/** The day runs from first light to night; whoever owns the minute (the app's skylingAt) spins on stage. */
const DayRun = () => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const L = useLayout();
  // equal screen time for each skyling: the scene is cut in five, and each part runs through that skyling's own hours
  const WINDOWS: [number, number][] = [
    [SUN.rise - 60, SUN.rise + 40],
    [SUN.rise + 50, SUN.set - 95],
    [SUN.set - 85, SUN.set],
    [SUN.set + 10, 20 * 60 + 50],
    [21 * 60 + 10, 23 * 60 + 40],
  ];
  const part = durationInFrames / WINDOWS.length;
  const k = Math.min(WINDOWS.length - 1, Math.floor(frame / part));
  const minute = interpolate(frame - k * part, [0, part], WINDOWS[k]);
  const who = skylingAt(minute, SUN.rise, SUN.set);
  const since = Math.round(frame - k * part);
  const hop = Math.min(1, since / 10);
  const night = minute > SUN.set + 30 || minute < SUN.rise - 30;
  const name = companionOf(who).name;
  const hh = Math.floor(minute / 60);
  const mm = Math.floor(minute % 60);
  const clock = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
  return (
    <Fade>
      <Sky minute={minute} clouds={4} />
      <Stage3D cam={[{ f: 0, pos: [0, 0.4, 7.5], look: [0, 0.2, 0], fov: 32 }, { f: durationInFrames, pos: [0, 0.6, 6.4], look: [0, 0.3, 0], fov: 32 }]} warmth={night ? 0.1 : 0.7}>
        <group position={[0, (L.portrait ? 0.75 : 0.25) + (1 - hop) * -2.2 + Math.sin((since / fps) * 5) * 0.06, 0]} rotation={[0.05, Math.sin(frame / 22) * 0.55, 0]} scale={0.6 + 0.4 * hop}>
          <VoxelSkyling who={who} pose={since < 18 ? "celebrate" : "idle"} poseFrame={Math.floor(since / 5)} night={night && (who === "star" || who === "moon")} height={L.portrait ? 2.2 : 3.0} />
        </group>
      </Stage3D>
      <div style={{ position: "absolute", left: 0, right: 0, top: L.safe.top, textAlign: "center", fontFamily: F.ui, color: "#fff", textShadow: "0 3px 18px rgb(4 10 24 / 0.5)" }}>
        <div style={{ fontSize: 46 * L.u, fontWeight: 600, letterSpacing: "0.08em", fontVariantNumeric: "tabular-nums" }}>{clock}</div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: L.safe.bottom, textAlign: "center", color: "#fff", textShadow: "0 3px 18px rgb(4 10 24 / 0.5)" }}>
        <div style={{ fontFamily: F.display, fontWeight: 700, fontSize: 104 * L.u, opacity: hop, transform: `translateY(${(1 - hop) * 30}px)` }}>{name}</div>
        <div style={{ fontFamily: F.ui, fontWeight: 500, fontSize: 40 * L.u, opacity: 0.85 * hop }}>{HOURS[who]}</div>
      </div>
      <Grain amount={0.05} />
    </Fade>
  );
};
const Lineup = () => {
  const frame = useCurrentFrame();
  const L = useLayout();
  return (
    <Fade>
      <Sky minute={21 * 60 + 40} clouds={0} sun={false} />
      <Stage3D cam={L.portrait ? [{ f: 0, pos: [-1.5, 0.8, 10.5], look: [0, -0.1, 0], fov: 32 }, { f: 134, pos: [1.2, 0.3, 9.6], look: [0, -0.1, 0], fov: 32 }] : [{ f: 0, pos: [-3, 1.2, 9], look: [0, 0, 0], fov: 32 }, { f: 134, pos: [2.5, 0.6, 8.2], look: [0, 0.1, 0], fov: 32 }]} warmth={0.2}>
        {COMPANION_KEYS.map((k, i) => {
          const s = prog(frame, 6 + i * 5, 20 + i * 5);
          // a row on wide screens; on a phone three over two
          const [x, y] = L.portrait ? [i < 3 ? (i - 1) * 1.3 : (i - 3.5) * 1.3, i < 3 ? 0.2 : -1.75] : [(i - 2) * 2.05, -0.6];
          const jump = Math.max(0, Math.sin((frame - 30 - i * 4) / 4)) * (frame > 30 && frame < 70 ? 0.35 : 0);
          return (
            <group key={k} position={[x, y + (1 - s) * -3 + jump, 0]} rotation={[0, Math.sin(frame / 30 + i) * 0.25, 0]}>
              <VoxelSkyling who={k} pose={frame > 30 && frame < 80 ? "celebrate" : "idle"} poseFrame={Math.floor(frame / 5)} night={k === "star" || k === "moon"} height={L.portrait ? 1.15 : 1.9} />
            </group>
          );
        })}
      </Stage3D>
      <KineticTitle text="Pick one. Or let the sky pick." gold={["sky"]} size={78} y={L.safe.top} at={20} />
      <Grain amount={0.05} />
    </Fade>
  );
};
const Outro = () => (
  <Fade outF={0}>
    <BrandOutro line="Meet your skyling." gold="skyling." minute={21 * 60} />
  </Fade>
);

export const skylingAd: Project = {
  id: "skyling-ad",
  title: "Someone's always up",
  concept: "A creative skyling ad: the five skylings as glossy 3D toys built from the app's own pixel art, each owning their hour of the day, ending on the cast.",
  formats: ["9x16", "1x1", "16x9"],
  music: { file: "audio/music_bright.mp3", from: 12, gain: -9 },
  cues: [
    { t: 0.1, sfx: "night_stars_twinkle", gain: -10 },
    { t: 2.3, sfx: "whoosh_scene_change", gain: -10 },
    { t: 2.6, sfx: "skylings_pop_up", gain: -9 },
    { t: 10.2, sfx: "whoosh_scene_change", gain: -10 },
    { t: 11.4, sfx: "star_tick_it_off", gain: -8 },
    { t: 14.6, sfx: "logo_ending_sound", gain: -6 },
  ],
  scenes: [
    { id: "hook", title: "Someone's always up", seconds: 2.5, mode: "code", why: "Type over the app's sky.", component: Hook },
    { id: "dayrun", title: "The day runs, each skyling takes its hour", seconds: 8, mode: "code", why: "3D voxels from the app's pixel art; who appears is the app's own skylingAt rule.", component: DayRun },
    { id: "lineup", title: "All five, night", seconds: 4.5, mode: "code", why: "Same voxel builder, one camera move.", component: Lineup },
    { id: "outro", title: "Meet your skyling", seconds: 3, mode: "code", why: "Brand sign-off.", component: Outro },
  ],
};
