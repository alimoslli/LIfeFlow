import { mountNight } from "@/components/skylings/night";
import { COMPANIONS } from "@/lib/companions";
import { drawCompanion, pixels, GRID, FRAMES } from "@/components/day-clock/companion";
(window as any).LF = { mountNight, COMPANIONS, drawCompanion, pixels, GRID, FRAMES };
