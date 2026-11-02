import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Gauge, MessageSquareText, Plug } from "lucide-react";
import { Badge, Card } from "@/components/ui/surface";
import { Head } from "./head";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { errorsLast24h, health, inboxCounts, listInbox, listUsers, overview, safe, usage } from "@/server/services/admin";
import { Failed, adminTz, ago } from "./format";
import { AdminTitle, Tile } from "./ui";

/** Overview: who's here, what needs you, and whether anything is failing. Each panel loads on its own. */
export default async function AdminHome() {
  await requireAdmin();
  const db = getDb();
  const [o, e, h, recent, use, fb, inbox] = await Promise.all([
    safe("overview", () => overview(db)),
    safe("errors", () => errorsLast24h(db)),
    safe("health", () => health(db)),
    safe("recent", () => listUsers(db, {})),
    safe("usage", () => usage(db)),
    safe("inbox-counts", () => inboxCounts(db)),
    safe("inbox", () => listInbox(db, { status: "open" })),
  ]);
  const tz = await adminTz();
  const today = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: tz }).format(new Date());

  // What needs the owner, most important first. Only facts, each with where to act.
  const attention: { icon: typeof AlertTriangle; text: string; href: string }[] = [];
  if (fb.ok && fb.data.open > 0)
    attention.push({ icon: MessageSquareText, text: `${fb.data.open} feedback message${fb.data.open === 1 ? "" : "s"} to read`, href: "/admin/feedback" });
  if (e.ok && e.data.kinds > 0)
    attention.push({
      icon: AlertTriangle,
      text: `${e.data.kinds} kind${e.data.kinds === 1 ? "" : "s"} of error in the last 24 hours (${e.data.hits} total)`,
      href: "/admin/errors",
    });
  if (use.ok && use.data.atLimit > 0)
    attention.push({ icon: Gauge, text: `${use.data.atLimit} ${use.data.atLimit === 1 ? "person is" : "people are"} at an AI limit`, href: "/admin/users" });
  if (h.ok) {
    const off = h.data.integrations.filter((i) => !i.on);
    if (off.length)
      attention.push({
        icon: Plug,
        text: `${off.length} setting${off.length === 1 ? "" : "s"} not set up: ${off.map((i) => i.name).join(", ")}`,
        href: "/admin/health",
      });
  }

  const max = o.ok ? Math.max(1, ...o.data.signupsByDay.map((d) => d.n)) : 1;
  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Overview" sub={today} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Tile label="Users" value={o.ok ? o.data.users : "–"} sub={o.ok ? `${o.data.new7d} new this week` : undefined} href="/admin/users" />
        <Tile label="Active today" value={o.ok ? o.data.active24h : "–"} sub={o.ok ? `${o.data.sessions} signed-in devices` : undefined} href="/admin/growth" />
        <Tile label="New today" value={o.ok ? o.data.new24h : "–"} sub={o.ok ? `${o.data.new30d} this month` : undefined} href="/admin/growth" />
        <Tile
          label="Open feedback"
          value={fb.ok ? fb.data.open : "–"}
          sub={fb.ok ? `${fb.data.total} received` : undefined}
          href="/admin/feedback"
          tone={fb.ok && fb.data.open > 0 ? "attention" : undefined}
        />
        <Tile label="Errors (24 h)" value={e.ok ? e.data.hits : "–"} sub={e.ok ? `${e.data.kinds} kinds` : undefined} href="/admin/errors" />
        <Tile
          label="AI messages today"
          value={use.ok ? use.data.messagesToday : "–"}
          sub={use.ok ? `${use.data.voiceToday} voice calls` : undefined}
          href="/admin/users"
        />
      </div>

      <Card className="p-5">
        <Head title="Needs your attention" />
        {attention.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-[0.9375rem] text-text-2">
            <CheckCircle2 className="h-5 w-5 text-success" /> All clear. Nothing is waiting for you.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border">
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

      <Card className="p-5">
        <Head title="Sign-ups, last 30 days" subtitle={o.ok ? `${o.data.new30d} in 30 days · ${o.data.invited} joined from invites` : undefined} />
        {o.ok ? (
          <div className="mt-4 flex h-28 items-end gap-[3px]" role="img" aria-label="Sign-ups per day for the last 30 days">
            {o.data.signupsByDay.map((d) => (
              <div key={d.day} className="flex h-full flex-1 items-end" title={`${d.day}: ${d.n}`}>
                <div className="w-full rounded-sm bg-accent" style={{ height: `${Math.max(d.n ? 8 : 2, (d.n / max) * 100)}%`, opacity: d.n ? 1 : 0.25 }} />
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <Head
            title="Latest feedback"
            action={
              <Link href="/admin/feedback" className="text-sm text-muted hover:text-text">
                All feedback
              </Link>
            }
          />
          {inbox.ok ? (
            inbox.data.length === 0 ? (
              <p className="mt-3 text-sm text-muted">Nothing open. New messages land here and in your email.</p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {inbox.data.slice(0, 4).map((f) => (
                  <li key={f.id} className="py-3">
                    <p className="flex items-center gap-2 text-xs text-muted">
                      <Badge tone={f.kind === "bug" ? "danger" : f.kind === "idea" ? "info" : "neutral"}>
                        {f.kind === "bug" ? "Bug" : f.kind === "idea" ? "Idea" : "Feedback"}
                      </Badge>
                      {f.senderName} · {ago(f.createdAt)}
                    </p>
                    <p className="mt-1.5 line-clamp-3 text-[0.9375rem] break-words">{f.message}</p>
                  </li>
                ))}
              </ul>
            )
          ) : (
            <p className="mt-3 text-sm text-danger">{Failed()}</p>
          )}
        </Card>

        <Card className="p-5">
          <Head
            title="Newest users"
            action={
              <Link href="/admin/users" className="text-sm text-muted hover:text-text">
                All users
              </Link>
            }
          />
          {recent.ok ? (
            <ul className="mt-2 divide-y divide-border">
              {recent.data.rows.slice(0, 5).map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
                      {u.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-medium">{u.name}</span>
                      <span className="block truncate text-sm text-muted">{u.email}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted">{ago(u.createdAt)}</span>
                  </Link>
                </li>
              ))}
              {recent.data.rows.length === 0 && <li className="py-3 text-sm text-muted">No users yet.</li>}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-danger">{Failed()}</p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <Head title="AI use" subtitle={use.ok && use.data.testing ? "Testing limits are on (paid plans are off)." : undefined} />
        {use.ok ? (
          <>
            {use.data.testing && (
              <p className="mt-2 text-sm text-text-2">
                Each person: {use.data.limits.messagesPerDay} messages a day ({use.data.limits.messagesPerMonth} a month, at most $
                {use.data.limits.assistantDollarsPerMonth} of AI) and {use.data.limits.voiceCallsPerDay} voice calls a day ({use.data.limits.voiceCallsPerMonth}{" "}
                a month, {use.data.limits.voiceCallMinutes} min each). Your account isn&apos;t limited.
              </p>
            )}
            {use.data.people.length === 0 ? (
              <p className="mt-3 text-sm text-muted">No AI use yet this month.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border border-t border-border">
                {use.data.people.slice(0, 8).map((p) => (
                  <li key={p.userId}>
                    <Link href={`/admin/users/${p.userId}`} className="flex items-center justify-between gap-3 py-3">
                      <span className="min-w-0 truncate text-[0.9375rem]">{p.email ?? "Deleted account"}</span>
                      <span className="tabular shrink-0 text-sm text-text-2">
                        {Math.min(p.messagesMonth, use.data.limits.messagesPerMonth)} msgs · {Math.min(p.voiceMonth, use.data.limits.voiceCallsPerMonth)} calls
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        )}
      </Card>
    </div>
  );
}
