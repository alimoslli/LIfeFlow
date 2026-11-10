import Link from "next/link";
import { PixelIcon } from "@/components/pixel/pixel-icon";

/** Title for a settings page, with a way back to the doors on a laptop (phones use the app bar). */
export function SettingsHeader({ title, back = "/settings", backLabel = "Settings" }: { title: string; back?: string; backLabel?: string }) {
  return (
    <header className="mb-5">
      <Link
        href={back}
        className="mb-2 hidden min-h-11 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-medium text-text-2 shadow-soft hover:text-text md:inline-flex"
      >
        <PixelIcon name="back" className="h-3.5 w-3.5" /> {backLabel}
      </Link>
      <h1 className="font-display text-[2.125rem] leading-tight font-medium tracking-tight">{title}</h1>
    </header>
  );
}
