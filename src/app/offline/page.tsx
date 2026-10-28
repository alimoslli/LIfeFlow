import type { Metadata } from "next";
import { CloudOff } from "lucide-react";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker when there's no connection and the page wasn't saved for offline reading. */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <CloudOff className="h-10 w-10 text-accent" />
      <h1 className="font-display text-[30px] font-medium">You&apos;re offline</h1>
      <p className="text-[15px] text-text-2">
        Pages you opened recently (Today, To-dos, Plan and Money) still work without a connection. To-dos, spending and shifts you add offline are saved on this
        phone and sync when you&apos;re back online.
      </p>
      <nav className="mt-2 grid w-full grid-cols-2 gap-2">
        {[
          ["/", "Today"],
          ["/tasks", "To-dos"],
          ["/plan", "Plan"],
          ["/money", "Money"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="flex min-h-12 items-center justify-center rounded-2xl bg-surface text-[15px] font-medium shadow-soft">
            {label}
          </a>
        ))}
      </nav>
    </main>
  );
}
