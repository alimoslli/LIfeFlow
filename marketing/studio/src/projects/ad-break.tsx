import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import {
  BrandOutro,
  Burst,
  CashCounter,
  City3D,
  F,
  Fade,
  GameSubtitles,
  Grain,
  KineticTitle,
  LayoutBox,
  MiniMap,
  MissionCard,
  Notification,
  Objective,
  OnQuad,
  Phone3D,
  projectPoints,
  prog,
  Room3D,
  Sky,
  Stage3D,
  TV_SCREEN,
  useLayout,
  type CamKey,
} from "../kit";
import type { Project } from "./types";

/**
 * "Ad break": it looks like a night in an open-world crime game (original world, original NPCs, a game HUD). The TV in
 * the apartment plays a LifeFlow ad; the camera goes through the screen into the ad, where an NPC's real LifeFlow day
 * has a casino heist on it, then comes back out to the room. Free version: everything in code. The paid version
 * swaps the room and the world shots for MAGI-2 footage and keeps the app, HUD and text in code.
 */
const TV_W = 1920;
const TV_H = 1080;

/** What the TV shows at the start: the ad opening, at the TV's own 16:9 shape. */
function TvOpening() {
  const L = useLayout();
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <Sky minute={10 * 60 + 40} clouds={4} />
      <KineticTitle text="Busy day?" size={150} y={L.height * 0.32} at={20} />
      <Img src={staticFile("app-brand/lifeflow-mark-192.png")} style={{ position: "absolute", right: 50, top: 40, width: 110, borderRadius: 26, opacity: prog(f, 5, 20) }} />
    </AbsoluteFill>
  );
}
/** The room around the TV, the HUD, and whatever plays on the screen, all lined up with the same camera. */
function RoomShot({ cam, tv, subtitles, hud = true, children }: { cam: CamKey[]; tv: React.ReactNode; subtitles?: { who: string; text: string; s: number; e: number }[]; hud?: boolean; children?: React.ReactNode }) {
  const f = useCurrentFrame();
  const L = useLayout();
  const quad = projectPoints(cam, f, L.width, L.height, TV_SCREEN);
  return (
    <AbsoluteFill style={{ background: "#07070c" }}>
      <Stage3D cam={cam} env={0.12} warmth={0.6} ambient={0.12} keyLight={0.35}>
        <Room3D />
      </Stage3D>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <OnQuad w={TV_W} h={TV_H} quad={quad}>
          <LayoutBox width={TV_W} height={TV_H}>
            {tv}
            {/* the panel's own glass: a sheen and a slight glow, so the picture sits in the room */}
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(120deg, rgb(255 255 255 / 0.10) 0%, transparent 35%, transparent 70%, rgb(255 255 255 / 0.05) 100%)" }} />
          </LayoutBox>
        </OnQuad>
      </AbsoluteFill>
      {hud && (
        <>
          <MiniMap seed={7} />
          <CashCounter from={4120} to={4120} a={0} b={1} />
        </>
      )}
      {subtitles && <GameSubtitles lines={subtitles} />}
      {children}
      <Grain amount={0.08} vignette={0.55} />
    </AbsoluteFill>
  );
}
const IN_CAM: CamKey[] = [
  { f: 0, pos: [0.45, 1.55, 3.2], look: [0, 1.0, -3], fov: 46 },
  { f: 100, pos: [0.15, 1.4, 1.6], look: [0, 1.15, -3], fov: 42 },
  { f: 179, pos: [0, 1.25, -1.84], look: [0, 1.25, -3], fov: 40 },
];
const RoomIn = () => {
  const f = useCurrentFrame();
  return (
    <Fade inF={0} outF={0}>
      <RoomShot
        cam={IN_CAM}
        tv={<TvOpening />}
        subtitles={[
          { who: "Nico", text: "Ugh. Ads.", s: 0.4, e: 2.0 },
          { who: "Vale", text: "Leave it. I like this one.", s: 2.2, e: 4.2 },
        ]}
        hud={f < 140}
      />
      {/* through the screen */}
      <AbsoluteFill style={{ background: "#fff", opacity: prog(f, 168, 180) * 0.9 }} />
    </Fade>
  );
};
/** Inside the ad: the NPC's real LifeFlow day on a phone (nico-mission capture). */
const AdPhone = () => {
  const L = useLayout();
  return (
    <Fade inF={6} outF={4}>
      <Sky minute={10 * 60 + 40} clouds={3} />
      <Stage3D
        handheld={1.2}
        cam={[
          { f: 0, pos: [1.6, -1.1, 4.2], look: [0, -0.3, 0], fov: 30 },
          { f: 90, pos: [0.3, -0.25, 3.9], look: [0, -0.33, 0], fov: 30 },
          { f: 239, pos: [0, -0.3, 3.4], look: [0, -0.36, 0], fov: 30 },
        ]}
      >
        <Phone3D screen="captures/nico-mission/today" rotation={[0.04, -0.08, 0]} />
      </Stage3D>
      <GameSubtitles
        lines={[
          { who: "Vale", text: "Nico. Don't tell me you forgot again.", s: 0.2, e: 2.6 },
          { who: "Vale", text: "You put the heist on your calendar?", s: 4.6, e: 6.4 },
          { who: "Nico", text: "It's color-coded.", s: 6.5, e: 7.9 },
        ]}
      />
      <Grain amount={0.06} />
    </Fade>
  );
};
const AdMission = () => (
  <Fade inF={4} outF={4}>
    <Sky minute={16 * 60 + 40} clouds={2} sun={false} />
    <Stage3D shadows={false} env={0.4} warmth={0.9} cam={[{ f: 0, pos: [-1.5, 2.2, -14], look: [0, 3.5, -50], fov: 48 }, { f: 104, pos: [1.0, 1.6, -26], look: [0, 3, -70], fov: 46 }]}>
      <City3D seed={31} fog="#d88a6a" />
    </Stage3D>
    <MissionCard at={4} hold={50} kicker="New objective" title="Flowers for Vale" />
    <Objective at={58} text="Get the flowers before dinner at 6:00 PM." mark="flowers" />
    <CashCounter from={4120} to={4075} a={66} b={86} />
    <Grain amount={0.07} vignette={0.5} />
  </Fade>
);
const AdPunch = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  return (
    <Fade inF={4} outF={4}>
      <Sky minute={17 * 60 - 10} clouds={3} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontSize: 210 * L.u, transform: `translateY(${(1 - prog(f, 0, 14)) * 80}px) rotate(-6deg)`, opacity: prog(f, 0, 10), filter: "drop-shadow(0 18px 30px rgb(0 0 0 / 0.35))" }}>💐</div>
      </AbsoluteFill>
      <GameSubtitles
        lines={[
          { who: "Vale", text: "Okay. Who are you, and what did you do with Nico?", s: 0.2, e: 2.2 },
          { who: "Nico", text: "LifeFlow.", s: 2.35, e: 3.4 },
        ]}
      />
      <Grain amount={0.06} />
    </Fade>
  );
};
const AdCleared = () => {
  const L = useLayout();
  const f = useCurrentFrame();
  return (
    <Fade inF={2} outF={0}>
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, #43305f 0%, #0d0b1c 75%)" }} />
      <Burst at={2} x={L.width / 2} y={L.height * 0.42} n={60} seed={5} />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", fontFamily: F.ui, fontStyle: "italic", textTransform: "uppercase", color: "#fff" }}>
        <div style={{ fontSize: 130 * L.u, fontWeight: 700, color: "#ffd77a", transform: `scale(${0.6 + 0.4 * prog(f, 0, 10)})`, WebkitTextStroke: `${6 * L.u}px #1a1030`, paintOrder: "stroke fill" }}>Day cleared</div>
        <div style={{ fontSize: 44 * L.u, fontWeight: 600, opacity: prog(f, 10, 20), letterSpacing: "0.06em", textTransform: "none" }}>Vale will appreciate this.</div>
      </AbsoluteFill>
      <CashCounter from={4075} to={4075} a={0} b={1} />
    </Fade>
  );
};
const OUT_CAM: CamKey[] = [
  { f: 0, pos: [0, 1.25, -1.84], look: [0, 1.25, -3], fov: 40 },
  { f: 80, pos: [-0.2, 1.4, 1.5], look: [0, 1.15, -3], fov: 42 },
  { f: 194, pos: [-0.45, 1.55, 3.2], look: [0, 1.0, -3], fov: 46 },
];
const RoomOut = () => {
  const f = useCurrentFrame();
  return (
    <RoomShot
      cam={OUT_CAM}
      tv={<BrandOutro line="Even Nico has his life together." gold="together." minute={21 * 60} cast={["star", "moon"]} />}
      subtitles={[
        { who: "Nico", text: "...", s: 2.6, e: 3.4 },
        { who: "Nico", text: "Where do I get that app?", s: 3.5, e: 5.4 },
      ]}
      hud={f > 30}
    >
      <Notification at={118} hold={70} title="LifeFlow" body="Next: Buy flowers for Vale at 11:00 AM." />
      <AbsoluteFill style={{ background: "#fff", opacity: 0.9 - prog(f, 0, 10) * 0.9 }} />
    </RoomShot>
  );
};

export const adBreak: Project = {
  id: "ad-break",
  title: "Ad break (open-world game parody, free version)",
  concept:
    "A night in an open-world crime game: the TV in an NPC's apartment plays a LifeFlow ad, the camera goes through the screen into the ad (the NPC's real LifeFlow day with a casino heist on it), then back out. Original world and characters.",
  formats: ["9x16"],
  captures: ["nico-mission/today"],
  music: { file: "audio/music_bright.mp3", from: 4, gain: -11 },
  cues: [
    { t: 0.1, sfx: "night_stars_twinkle", gain: -14 },
    { t: 5.6, sfx: "whoosh_scene_change", gain: -6 },
    { t: 7.6, sfx: "tap", gain: -6 },
    { t: 12.2, sfx: "added_to_your_day", gain: -9 },
    { t: 14.1, sfx: "whoosh_scene_change", gain: -9 },
    { t: 14.3, sfx: "answer_lands", gain: -6 },
    { t: 16.4, sfx: "tap", gain: -7 },
    { t: 21.2, sfx: "sun_goal_reached", gain: -6 },
    { t: 23.6, sfx: "whoosh_scene_change", gain: -8 },
    { t: 24.0, sfx: "logo_ending_sound", gain: -7 },
    { t: 27.5, sfx: "send", gain: -6 },
  ],
  scenes: [
    { id: "room-in", title: "Night in the apartment, the ad comes on, through the screen", seconds: 6, mode: "code", why: "Stylised 3D room in code. Paid version: a MAGI-2 room plate with a green TV screen, the ad pinned onto it in code.", estimate: { credits: 15, model: "magi_2 (6 s)" }, component: RoomIn },
    { id: "ad-phone", title: "In the ad: the NPC's real LifeFlow day", seconds: 8, mode: "code", why: "The real app (nico-mission capture) on a 3D phone: always code.", component: AdPhone },
    { id: "ad-mission", title: "The heads-up becomes a mission", seconds: 3.5, mode: "code", why: "HUD graphics are code. Paid version: a MAGI-2 street plate behind them.", estimate: { credits: 10, model: "magi_2 (4 s)" }, component: AdMission },
    { id: "ad-punch", title: "Flowers: who are you?", seconds: 3.5, mode: "code", why: "Subtitles over the sky. Paid version: the MAGI-2 rooftop two-shot.", estimate: { credits: 10, model: "magi_2 (4 s)" }, component: AdPunch },
    { id: "ad-cleared", title: "Day cleared", seconds: 2.5, mode: "code", why: "Type and particles.", component: AdCleared },
    { id: "room-out", title: "Back in the room: Where do I get that app?", seconds: 6.5, mode: "code", why: "Same room; the sign-off plays on the TV.", estimate: { credits: 17.5, model: "magi_2 (7 s)" }, component: RoomOut },
  ],
};
