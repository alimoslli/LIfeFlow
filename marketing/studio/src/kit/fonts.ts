import { continueRender, delayRender, staticFile } from "remotion";

/** The app's typefaces (Fraunces for display, Geist for UI), loaded before any frame renders. */
export const F = {
  display: "'LF Fraunces', Georgia, serif",
  ui: "'LF Geist', system-ui, sans-serif",
};
const faces: [string, string, string][] = [
  ["LF Fraunces", "Fraunces-SemiBold.ttf", "600"],
  ["LF Fraunces", "Fraunces-Bold.ttf", "700"],
  ["LF Geist", "Geist-Regular.ttf", "400"],
  ["LF Geist", "Geist-Medium.ttf", "500"],
  ["LF Geist", "Geist-SemiBold.ttf", "600"],
  ["LF Geist", "Geist-Bold.ttf", "700"],
];
let started = false;
export function loadFonts() {
  if (started || typeof document === "undefined") return;
  started = true;
  const h = delayRender("fonts");
  Promise.all(
    faces.map(([fam, file, weight]) => {
      const ff = new FontFace(fam, `url(${staticFile(`fonts/${file}`)})`, { weight });
      return ff.load().then((f) => document.fonts.add(f));
    }),
  ).then(() => continueRender(h), () => continueRender(h));
}
