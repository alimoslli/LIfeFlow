import { continueRender, delayRender, staticFile } from "remotion";

/** The app's typefaces (Fraunces for display, Geist for UI), loaded before any frame renders. */
export const F = {
  display: "'LF Fraunces', Georgia, serif",
  ui: "'LF Geist', system-ui, sans-serif",
  /** Bricolage Grotesque (OFL), variable width: condensed mission titles (fontStretch 75%) */
  mission: "'LF Mission', 'LF Geist', sans-serif",
  /** Inter Display (OFL): clean HUD labels and subtitles */
  hud: "'LF Inter', 'LF Geist', sans-serif",
};
const faces: [string, string, string][] = [
  ["LF Fraunces", "Fraunces-SemiBold.ttf", "600"],
  ["LF Fraunces", "Fraunces-Bold.ttf", "700"],
  ["LF Geist", "Geist-Regular.ttf", "400"],
  ["LF Geist", "Geist-Medium.ttf", "500"],
  ["LF Geist", "Geist-SemiBold.ttf", "600"],
  ["LF Geist", "Geist-Bold.ttf", "700"],
  ["LF Inter", "InterDisplay-Medium.otf", "500"],
  ["LF Inter", "InterDisplay-SemiBold.otf", "600"],
  ["LF Inter", "InterDisplay-Bold.otf", "700"],
];
let started = false;
export function loadFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const h = delayRender("fonts");
  const mission = new FontFace("LF Mission", `url(${staticFile("fonts/Bricolage-VF.ttf")})`, { weight: "200 800", stretch: "75% 100%" });
  Promise.all([
    mission.load().then((f) => document.fonts.add(f)),
    ...faces.map(([fam, file, weight]) => {
      const ff = new FontFace(fam, `url(${staticFile(`fonts/${file}`)})`, { weight });
      return ff.load().then((f) => document.fonts.add(f));
    }),
  ]).then(() => continueRender(h), () => continueRender(h));
}
