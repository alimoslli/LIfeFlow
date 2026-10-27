import { Sparkles } from "lucide-react";
import { AskJarvisButton } from "@/components/shell/app-shell";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { loadHome } from "./_home/data";
import { AlertsWidget, HOME_WIDGETS } from "./_home/widgets";

function greeting(hour: number) {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  const { d, firstName } = await withCurrentUser(async (s, u) => ({ d: await loadHome(s, u), firstName: u.name.split(" ")[0] }));
  const hour = Number(formatIn(d.now, d.tz, "H"));
  const summary = [
    d.agenda.length ? `${d.agenda.length} thing${d.agenda.length > 1 ? "s" : ""} on your calendar` : "a clear calendar",
    d.deadlines.length ? `${d.deadlines.length} deadline${d.deadlines.length > 1 ? "s" : ""} this week` : null,
  ]
    .filter(Boolean)
    .join(" and ");

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-sm text-muted">{formatIn(d.now, d.tz, "EEEE, MMMM d")}</p>
        <h1 className="mt-1 font-display text-[34px] leading-tight font-medium tracking-tight">
          {greeting(hour)}, {firstName}.
        </h1>
        <p className="mt-1 text-[15px] text-text-2">You have {summary}.</p>
      </header>

      <AskJarvisButton className="group flex w-full items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 text-left shadow-soft transition-colors hover:border-accent">
        <Sparkles className="h-4 w-4 text-accent" />
        <span className="flex-1 text-[15px] text-muted group-hover:text-text-2">Ask Jarvis — “What do I need to get done today?”</span>
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 text-[10px] text-muted sm:inline">⌘J</kbd>
      </AskJarvisButton>

      <AlertsWidget d={d} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-5">
          {HOME_WIDGETS.primary.map((W) => (
            <W key={W.name} d={d} />
          ))}
        </div>
        <div className="flex flex-col gap-5">
          {HOME_WIDGETS.secondary.map((W) => (
            <W key={W.name} d={d} />
          ))}
        </div>
      </div>
    </div>
  );
}
