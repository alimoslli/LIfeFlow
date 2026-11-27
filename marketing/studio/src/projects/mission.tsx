import { AbsoluteFill, useCurrentFrame } from "remotion";
import { BrandOutro, Burst, CashCounter, City3D, F, Fade, Grain, KineticTitle, MiniMap, MissionCard, Notification, Objective, Phone3D, Stage3D, prog, useLayout } from "../kit";
import type { Project } from "./types";

/**
 * POC 3, a crime-game style phone and mission sequence (original parody: invented characters, city and HUD; no game's
 * names, fonts or marks). Nico's real LifeFlow day (nico-mission captures) runs the "missions".
 */
const Street = () => {
  const f = useCurrentFrame();
  return (
    <Fade inF={0}>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #0b0f2a 0%, #24204a 60%, #46305a 100%)" }} />
      <Stage3D shadows={false} env={0.25} cam={[{ f: 0, pos: [0, 1.4, 6], look: [0, 3, -30], fov: 50 }, { f: 119, pos: [0.8, 3.2, -14], look: [0, 4, -60], fov: 46 }]}>
        <City3D />
      </Stage3D>
      <MiniMap />
      <CashCounter from={4120} to={4120} a={0} b={1} />
      <KineticTitle text="Port Solana. 5:10 PM." size={64} y={useLayout().height * 0.42} at={8} font={F.ui} />
      <Grain amount={0.09} vignette={0.6} />
      {f > 100 && <AbsoluteFill style={{ background: "#fff", opacity: (f - 100) / 30 }} />}
    </Fade>
  );
};
const PhoneUp = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  return (
    <Fade>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #3a2c5c 0%, #120f26 70%)" }} />
      <Stage3D handheld={1.4} cam={[{ f: 0, pos: [0.9, -2.2, 3.7], look: [0, 0, 0], fov: 32 }, { f: 60, pos: [0.2, -0.3, 3.3], look: [0, 0, 0], fov: 32 }, { f: 179, pos: [0, 0, 2.8], look: [0, 0.02, 0], fov: 32 }]} warmth={0.3}>
        <Phone3D screen="captures/nico-mission/today" rotation={[0.08, -0.1 + f * 0.0006, -0.04]} body="#3a3d46" />
      </Stage3D>
      <Notification at={20} hold={100} title="Twinkle" body="Dinner with Vale at 6:30. Flowers are still on your list." />
      <CashCounter from={4120} to={4120} a={0} b={1} />
      <Grain amount={0.07} vignette={0.5} />
    </Fade>
  );
};
const Mission = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  return (
    <Fade>
      <AbsoluteFill style={{ background: "linear-gradient(180deg, #120f26 0%, #2b2050 100%)" }} />
      <Stage3D shadows={false} env={0.25} cam={[{ f: 0, pos: [-2, 2.5, -20], look: [0, 3, -50], fov: 48 }, { f: 104, pos: [1.2, 1.6, -30], look: [0, 2.5, -70], fov: 46 }]}>
        <City3D seed={23} />
      </Stage3D>
      <MissionCard at={4} hold={52} kicker="New objective" title="Flowers for Vale" />
      <Objective at={62} text="Get to the florist before 6:30 PM." mark="florist" />
      <CashCounter from={4120} to={4075} a={72} b={92} />
      <MiniMap />
      <Grain amount={0.09} vignette={0.6} />
    </Fade>
  );
};
const Passed = () => {
  const f = useCurrentFrame();
  const L = useLayout();
  return (
    <Fade outF={4}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, #43305f 0%, #0d0b1c 75%)" }} />
      <Burst at={4} x={L.width / 2} y={L.height * 0.42} n={60} seed={5} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: F.ui, fontStyle: "italic", textTransform: "uppercase", color: "#fff" }}>
        <div style={{ fontSize: 130 * L.u, fontWeight: 700, color: "#ffd77a", transform: `scale(${0.6 + 0.4 * prog(f, 0, 10)})`, WebkitTextStroke: `${6 * L.u}px #1a1030`, paintOrder: "stroke fill" }}>Day cleared</div>
        <div style={{ fontSize: 40 * L.u, fontWeight: 600, opacity: prog(f, 12, 22), letterSpacing: "0.06em", textAlign: "center", lineHeight: 1.35 }}>Flowers bought · Dinner on time<br />Next: casino job, 9:30 PM</div>
      </AbsoluteFill>
      <CashCounter from={4075} to={4075} a={0} b={1} />
      <Grain amount={0.08} vignette={0.55} />
    </Fade>
  );
};
const Outro = () => (
  <Fade outF={0}>
    <BrandOutro line="Even on your wildest days." gold="days." minute={21 * 60 + 30} cast={["star", "moon"]} />
  </Fade>
);

export const mission: Project = {
  id: "mission",
  title: "Nico's day (crime-game parody)",
  concept: "A crime-game style sequence: night city, the phone buzzes, the skyling's heads-up becomes a mission (flowers before dinner), money ticks, day cleared. Nico's real LifeFlow day is on the phone.",
  formats: ["9x16", "1x1", "16x9"],
  captures: ["nico-mission/today"],
  music: { file: "audio/music_bright.mp3", from: 20, gain: -10 },
  cues: [
    { t: 0.2, sfx: "whoosh_scene_change", gain: -12 },
    { t: 4.2, sfx: "send", gain: -6 },
    { t: 4.75, sfx: "answer_lands", gain: -6 },
    { t: 10.1, sfx: "whoosh_scene_change", gain: -8 },
    { t: 10.2, sfx: "added_to_your_day", gain: -6 },
    { t: 12.5, sfx: "tap", gain: -6 },
    { t: 13.6, sfx: "sun_goal_reached", gain: -6 },
    { t: 16.6, sfx: "logo_ending_sound", gain: -6 },
  ],
  scenes: [
    {
      id: "street",
      title: "Night street, game HUD",
      seconds: 4,
      mode: "code",
      why: "A stylised code city reads as 'game' and costs nothing. For a photoreal open-world street with people and traffic, this is the scene to hand to MAGI-2 (hybrid) and keep the HUD in code.",
      estimate: { credits: 10, model: "magi_2 (4 s, 1080p)", note: "only if the owner wants photoreal footage here" },
      component: Street,
    },
    { id: "phone", title: "The phone buzzes: the real app", seconds: 6, mode: "code", why: "3D phone in code with the real Today screen captured from the current app.", component: PhoneUp },
    {
      id: "mission",
      title: "The heads-up becomes a mission",
      seconds: 3.5,
      mode: "code",
      why: "Mission card, objective line and cash counter are HUD graphics: code does them crisply and repeatably.",
      component: Mission,
    },
    { id: "passed", title: "Day cleared", seconds: 2.5, mode: "code", why: "Type and particles.", component: Passed },
    { id: "outro", title: "Sign-off", seconds: 3, mode: "code", why: "Brand.", component: Outro },
  ],
};
