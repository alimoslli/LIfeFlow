// The real skyling art, bundled for the Starlight prototype (build.mjs). Nothing here is changed: the game draws the
// same five skylings, cloud, star and Puff that the app draws.
import { COMPANIONS } from "@/lib/companions";
import { pixels, FRAMES, GRID } from "@/components/day-clock/companion";
import { cloud, ART, STAR_ICON, SUN_ICON, PAL } from "@/components/skylings/home-art";

(window as unknown as { Skylings: unknown }).Skylings = { COMPANIONS, pixels, FRAMES, GRID, cloud, ART, STAR_ICON, SUN_ICON, PAL };
