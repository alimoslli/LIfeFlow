/**
 * The only door from the studio into the LifeFlow app. Everything here is the app's own code, imported from the
 * synced checkout (npm run sync-app), so a video always draws the current skylings, sky and icons. Never redraw
 * these by hand in the studio: if the app changes them, a re-render picks the change up.
 */
export { pixels, GRID, FRAMES, type Pose, type Activity } from "@/components/day-clock/companion";
export { COMPANIONS, COMPANION_KEYS, companionOf, skylingAt, type CompanionKey, type CompanionInfo } from "@/lib/companions";
export { skyAt, darkness, css as rgbCss, mix, type RGB } from "@/lib/sky";
export { pixelPaths } from "@/components/day-clock/pixel-icons";
import brandJson from "./brand.generated.json";

export type BrandTokens = Record<string, string>;
export const BRAND = brandJson as { commit: string; light: BrandTokens; dark: BrandTokens; theme: BrandTokens; fonts: string[] };
/** A brand colour by token name, e.g. tok("accent"), tok("night-2"), tok("sun"). Light theme unless dark. */
export function tok(name: string, dark = false): string {
  const v = (dark ? BRAND.dark[name] : undefined) ?? BRAND.light[name] ?? BRAND.theme[`color-${name}`];
  if (!v) throw new Error(`Unknown LifeFlow token "${name}" (app ${BRAND.commit.slice(0, 8)})`);
  const ref = v.match(/^var\(--([\w-]+)\)$/);
  return ref ? tok(ref[1], dark) : v;
}
/** The skyling who owns a minute of the day ("Changes with the sky"), with a simple sunrise 7:00 and sunset 17:00. */
export const SUN = { rise: 7 * 60, set: 17 * 60 };
