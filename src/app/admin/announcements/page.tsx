import { Info, TriangleAlert } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui/surface";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { requireAdmin } from "@/server/auth/require-admin";
import { getDb } from "@/server/db/client";
import { listAnnouncements, safe } from "@/server/services/admin";
import { createAnnouncementAction, endAnnouncementAction } from "../actions";
import { Head } from "../head";
import { Failed, adminTz, fmt } from "../format";
import { AdminTitle, Notice } from "../ui";

/** A banner everyone sees at the top of the app. One at a time; a new one replaces the current one. */
export default async function AdminAnnouncements({ searchParams }: { searchParams: Promise<{ done?: string; error?: string }> }) {
  await requireAdmin();
  const sp = await searchParams;
  const r = await safe("announcements", () => listAnnouncements(getDb()));
  const tz = await adminTz();
  const live = r.ok ? r.data.live : null;
  return (
    <div className="flex flex-col gap-5">
      <AdminTitle title="Announcements" sub="A banner everyone sees at the top of the app, like news, maintenance or a new feature." />
      <Notice done={sp.done} error={sp.error} />

      <Card className="p-5">
        <Head title="Showing now" />
        {live ? (
          <div className="mt-3 flex flex-col gap-3">
            <div className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-[0.9375rem] ${live.tone === "warning" ? "bg-warning-soft" : "bg-accent-soft"}`}>
              {live.tone === "warning" ? (
                <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              ) : (
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              )}
              <span className="min-w-0 break-words">{live.message}</span>
            </div>
            <p className="text-xs text-muted">
              Since {fmt(live.startsAt, tz)} · {live.endsAt ? `ends ${fmt(live.endsAt, tz)}` : "until you end it"}
              {live.linkUrl ? ` · links to ${live.linkUrl}` : ""}
            </p>
            <form action={endAnnouncementAction}>
              <input type="hidden" name="id" value={live.id} />
              <SubmitButton variant="secondary" size="sm" pendingText="Ending…">
                End now
              </SubmitButton>
            </form>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">Nothing is showing.</p>
        )}
      </Card>

      <Card className="p-5">
        <Head title="New announcement" subtitle="Replaces anything showing now. People can close it on their device." />
        <form action={createAnnouncementAction} className="mt-4 flex flex-col gap-3">
          <Field label="Message" htmlFor="a-message">
            <Input
              id="a-message"
              name="message"
              required
              minLength={3}
              maxLength={240}
              placeholder="New: connect Microsoft Teams in Settings → Connected accounts."
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Style" htmlFor="a-tone">
              <Select id="a-tone" name="tone" defaultValue="info">
                <option value="info">News (green)</option>
                <option value="warning">Heads up (amber)</option>
              </Select>
            </Field>
            <Field label="Show for" htmlFor="a-days">
              <Select id="a-days" name="days" defaultValue="7">
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">1 week</option>
                <option value="14">2 weeks</option>
                <option value="30">30 days</option>
                <option value="">Until I end it</option>
              </Select>
            </Field>
            <Field label="Link (optional)" htmlFor="a-link">
              <Input id="a-link" name="linkUrl" placeholder="/settings/integrations" />
            </Field>
          </div>
          <SubmitButton pendingText="Publishing…" className="self-start">
            Show to everyone
          </SubmitButton>
        </form>
      </Card>

      <Card className="p-5">
        <Head title="Past announcements" />
        {!r.ok ? (
          <p className="mt-3 text-sm text-danger">{Failed()}</p>
        ) : r.data.items.filter((a) => a.id !== live?.id).length === 0 ? (
          <div className="mt-3">
            <EmptyState title="None yet">Announcements you publish are listed here.</EmptyState>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-border">
            {r.data.items
              .filter((a) => a.id !== live?.id)
              .map((a) => (
                <li key={a.id} className="py-3">
                  <p className="text-[0.9375rem] break-words">{a.message}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <Badge tone={a.tone === "warning" ? "warning" : "success"}>{a.tone === "warning" ? "Heads up" : "News"}</Badge>
                    {fmt(a.startsAt, tz)} to {a.endsAt ? fmt(a.endsAt, tz) : "now"}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
