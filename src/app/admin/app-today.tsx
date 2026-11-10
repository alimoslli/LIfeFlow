import Link from "next/link";
import { AlertTriangle, ArrowRight, Gauge, MessageSquareText, Plug } from "lucide-react";
import { Card } from "@/components/ui/surface";
import { getDb } from "@/server/db/client";
import { errorsLast24h, health, inboxCounts, overview, safe, usage } from "@/server/services/admin";
import { Head } from "./head";
import { Tile } from "./ui";

/** "The app today": five key facts that link to People or App, and what needs attention (only when something does). Each fact loads on its own. */
export async function AppToday() {
  const db = getDb();
  const [o, e, h, fb, use] = await Promise.all([
    safe("overview", () => overview(db)),
    safe("errors", () => errorsLast24h(db)),
    safe("health", () => health(db)),
    safe("inbox-counts", () => inboxCounts(db)),
    safe("usage", () => usage(db)),
  ]);

  // Most important first. Only facts, each with where to act.
  const attention: { icon: typeof AlertTriangle; text: string; href: string }[] = [];
  if (fb.ok && fb.data.open > 0)
    attention.push({
      icon: MessageSquareText,
      text: `${fb.data.open} feedback message${fb.data.open === 1 ? "" : "s"} to read`,
      href: "/admin/people#feedback",
    });
  if (e.ok && e.data.kinds > 0)
    attention.push({
      icon: AlertTriangle,
      text: `${e.data.kinds} kind${e.data.kinds === 1 ? "" : "s"} of error in the last 24 hours (${e.data.hits} total)`,
      href: "/admin/app#errors",
    });
  if (use.ok && use.data.atLimit > 0)
    attention.push({
      icon: Gauge,
      text: `${use.data.atLimit} ${use.data.atLimit === 1 ? "person is" : "people are"} at an AI limit`,
      href: "/admin/app#ai-use",
    });
  if (h.ok) {
    const off = h.data.integrations.filter((i) => !i.on);
    if (off.length)
      attention.push({
        icon: Plug,
        text: `${off.length} setting${off.length === 1 ? "" : "s"} not set up: ${off.map((i) => i.name).join(", ")}`,
        href: "/admin/app#health",
      });
  }

  return (
    <section aria-labelledby="app-today-title">
      <Card className="p-5">
        <Head title={<span id="app-today-title">The app today</span>} />
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Tile label="Users" value={o.ok ? o.data.users : "–"} sub={o.ok ? `${o.data.new7d} new this week` : undefined} href="/admin/people" />
          <Tile
            label="Active today"
            value={o.ok ? o.data.active24h : "–"}
            sub={o.ok ? `${o.data.sessions} signed-in devices` : undefined}
            href="/admin/people?seen=today#people"
          />
          <Tile label="New today" value={o.ok ? o.data.new24h : "–"} sub={o.ok ? `${o.data.new30d} this month` : undefined} href="/admin/app#growth" />
          <Tile label="Errors (24 h)" value={e.ok ? e.data.hits : "–"} sub={e.ok ? `${e.data.kinds} kinds` : undefined} href="/admin/app#errors" />
          <Tile
            label="Open feedback"
            value={fb.ok ? fb.data.open : "–"}
            sub={fb.ok ? `${fb.data.total} received` : undefined}
            href="/admin/people#feedback"
            tone={fb.ok && fb.data.open > 0 ? "attention" : undefined}
          />
        </div>
        {attention.length > 0 && (
          <ul className="mt-3 divide-y divide-border border-t border-border">
            {attention.map((a) => (
              <li key={a.text}>
                <Link href={a.href} className="flex min-h-12 items-center gap-3 py-2.5">
                  <a.icon className="h-5 w-5 shrink-0 text-accent" aria-hidden />
                  <span className="min-w-0 flex-1 text-[0.9375rem]">{a.text}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
