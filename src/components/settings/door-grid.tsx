import Link from "next/link";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import type { COLOR } from "@/components/pixel/art";
import { SkylingIcon } from "@/components/skylings/sprite";
import { cn } from "@/lib/utils";

export type Door = { href: string; icon: keyof typeof COLOR | "skyling"; label: string; detail?: string };

/**
 * Doors, not a list (owner, 2026-11-10: the app must not look like a phone's own settings): each place is a card with
 * its own pixel picture, its name and one line about how things stand. No rows, no arrows. `onPick` runs when a door is
 * taken (the sheet closes behind it).
 */
export function DoorGrid({ doors, onPick, className }: { doors: Door[]; onPick?: () => void; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-3", className)}>
      {doors.map((d) => (
        <li key={d.href} className="min-w-0">
          <Link
            href={d.href}
            onClick={onPick}
            className="lf-door flex h-full min-h-[6.25rem] flex-col justify-between gap-3 rounded-[1.375rem] bg-surface p-3.5 shadow-soft transition-transform active:scale-[0.97]"
          >
            {d.icon === "skyling" ? <SkylingIcon className="h-9 w-9" /> : <PixelIcon name={d.icon} className="h-9 w-9" />}
            <span className="min-w-0">
              <span className="block text-[0.9375rem] leading-tight font-semibold text-balance break-words">{d.label}</span>
              {d.detail && <span className="mt-0.5 block text-[0.75rem] leading-snug text-muted">{d.detail}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
