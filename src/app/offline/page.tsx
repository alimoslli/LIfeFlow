import type { Metadata } from "next";
import { PixelIcon } from "@/components/pixel/pixel-icon";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker when there's no connection and the page wasn't saved for offline reading. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-3xl bg-hero shadow-soft" aria-hidden>
        <PixelIcon name="cloud" className="h-12 w-12" />
      </span>
      <h1 className="font-display text-[1.875rem] font-medium">You&apos;re offline</h1>
      <p className="text-[0.9375rem] text-text-2">
        Pages you opened recently (Today, To-dos, Calendar and Money) still work without a connection. To-dos, spending and shifts you add offline are saved on
        this phone and sync when you&apos;re back online.
      </p>
      <nav className="mt-2 grid w-full grid-cols-2 gap-2">
        {[
          ["/", "Today"],
          ["/tasks", "To-dos"],
          ["/plan", "Calendar"],
          ["/money", "Money"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="flex min-h-12 items-center justify-center rounded-2xl bg-surface text-[0.9375rem] font-medium shadow-soft">
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
