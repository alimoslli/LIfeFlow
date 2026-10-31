import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/** Title for a settings page, with a way back to the list on desktop (phones use the app bar). */
export function SettingsHeader({ title, back = "/settings", backLabel = "Settings" }: { title: string; back?: string; backLabel?: string }) {
  return (
    <header className="mb-5">
      <Link href={back} className="mb-1 hidden min-h-11 items-center gap-0.5 text-sm text-accent md:inline-flex">
        <ChevronLeft className="h-4 w-4" /> {backLabel}
      </Link>
      <h1 className="font-display text-[34px] leading-tight font-medium tracking-tight">{title}</h1>
    </header>
  );
}
