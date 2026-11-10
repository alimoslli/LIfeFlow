import { COMPANIONS, skylingAt } from "@/lib/companions";
import { drawCompanion, pixels, GRID } from "@/components/day-clock/companion";
import { skyAt, darkness } from "@/lib/sky";
import { sunTimes } from "@/lib/day-clock";
(window as unknown as { LF: unknown }).LF = { COMPANIONS, skylingAt, drawCompanion, pixels, GRID, skyAt, darkness, sunTimes };
