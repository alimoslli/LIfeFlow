import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Phone3D, Stage3D, Sky, KineticTitle, Notification, BrandOutro, Grain, F, prog, useLayout, PixelSkyling, Fade } from "../kit";
import type { Project } from "./types";

/** POC 1, a cinematic product demo: the real app (alex-student captures) in a phone the camera flies around. */
const Hook = () => {
  const L = useLayout();
  return (
    <Fade inF={0} outF={6}>
      <Sky minute={[6 * 60 + 40, 8 * 60 + 30]} clouds={0} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <KineticTitle text="Your whole day, worked out before you ask." gold={["worked"]} size={L.portrait ? 104 : 84} y={L.height * 0.36} />
      </AbsoluteFill>
      <Grain />
    </Fade>
  );
};
const PhoneToday = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  return (
    <Fade>
      <Sky minute={12 * 60 + 20} clouds={4} sun />
      <Stage3D
        handheld={1}
        cam={[
          { f: 0, pos: [2.2, -1.5, 3.9], look: [0, -0.3, 0], fov: 30 },
          { f: 80, pos: [0.5, -0.25, 3.8], look: [0, -0.33, 0], fov: 30 },
          { f: 179, pos: [0.0, -0.3, 3.35], look: [0, -0.36, 0], fov: 30 },
        ]}
      >
        <Phone3D screen="captures/alex-student/today" rotation={[0, -0.12 + f * 0.0007, 0]} />
      </Stage3D>
      <KineticTitle text="Class, work and money on one sky." gold={["one", "sky."]} size={70} y={L.height - L.safe.bottom - 40 * L.u} at={6} />
      <Grain amount={0.06} />
    </Fade>
  );
};
const Money = () => {
  const L = useLayout();
  return (
    <Fade>
      <Sky minute={17 * 60 + 10} clouds={3} />
      <Stage3D
        handheld={1}
        cam={[
          { f: 0, pos: [-1.6, 0.3, 4.0], look: [0, -0.32, 0], fov: 30 },
          { f: 119, pos: [-0.5, -0.15, 3.5], look: [0, -0.36, 0], fov: 30 },
        ]}
        warmth={0.8}
      >
        <Phone3D screen="captures/alex-student/money" rotation={[0.05, 0.25, 0.02]} />
      </Stage3D>
      <Notification at={28} hold={80} title="Ray" body="Rent ($950) is due Tuesday. You have $1,842 in checking." />
      <KineticTitle text="It tells you before the bill does." gold={["before"]} size={66} y={L.height - L.safe.bottom - 40 * L.u} at={8} />
      <Grain amount={0.06} />
    </Fade>
  );
};
const Outro = () => (
  <Fade outF={0}>
    <BrandOutro minute={20 * 60 + 30} />
    <Grain amount={0.05} />
  </Fade>
);
const RayWave = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  return (
    <Fade>
      <Sky minute={[9 * 60, 15 * 60]} clouds={4} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 30 * L.u }}>
        <PixelSkyling who="ray" pose={f < 40 ? "wave" : "celebrate"} scale={Math.round(18 * L.u)} style={{ transform: `translateY(${(1 - prog(f, 0, 16)) * 300}px)` }} />
        <div style={{ fontFamily: F.display, fontWeight: 700, color: "#fff", fontSize: 64 * L.u, textShadow: "0 4px 24px rgb(4 10 24 / 0.45)", opacity: prog(f, 10, 22) }}>Meet Ray. He keeps an eye on it.</div>
      </AbsoluteFill>
    </Fade>
  );
};

export const productDemo: Project = {
  id: "product-demo",
  title: "LifeFlow: your day, worked out",
  concept: "A cinematic product demonstration: the real app in a phone the camera flies around, the skyling, a bill heads-up, the brand.",
  formats: ["9x16", "1x1", "16x9"],
  captures: ["alex-student/today", "alex-student/money"],
  music: { file: "audio/music_bright.mp3", from: 2, gain: -9 },
  cues: [
    { t: 0.05, sfx: "sky_turns", gain: -10 },
    { t: 2.4, sfx: "whoosh_scene_change", gain: -10 },
    { t: 4.6, sfx: "tap", gain: -6 },
    { t: 8.4, sfx: "skylings_pop_up", gain: -8 },
    { t: 11.4, sfx: "whoosh_scene_change", gain: -10 },
    { t: 12.35, sfx: "answer_lands", gain: -7 },
    { t: 15.4, sfx: "logo_ending_sound", gain: -6 },
  ],
  scenes: [
    { id: "hook", title: "Hook: the morning sky", seconds: 2.5, mode: "code", why: "Type and the app's own sky: fast and exact in code.", component: Hook },
    { id: "today", title: "The real Today screen in a flying phone", seconds: 6, mode: "code", why: "The phone is 3D in code and the screen is a real capture of the current app.", component: PhoneToday },
    { id: "ray", title: "Meet Ray", seconds: 3, mode: "code", why: "The skyling is drawn by the app's own pixel code.", component: RayWave },
    { id: "money", title: "A bill heads-up over the Money screen", seconds: 4, mode: "code", why: "Real Money capture, notification drawn in code.", component: Money },
    { id: "outro", title: "LifeFlow sign-off", seconds: 3, mode: "code", why: "Brand mark and skylings from the app.", component: Outro },
  ],
};
