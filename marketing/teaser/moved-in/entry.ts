import { mountNight } from "@/components/skylings/night";
import { COMPANIONS } from "@/lib/companions";
import { drawCompanion, pixels, GRID, FRAMES } from "@/components/day-clock/companion";
import { skyAt, darkness } from "@/lib/sky";
(window as any).LF = { mountNight, COMPANIONS, drawCompanion, pixels, GRID, FRAMES, skyAt, darkness };
