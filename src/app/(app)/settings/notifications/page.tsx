import type { Metadata } from "next";
import { Smartphone, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { formatIn } from "@/lib/dates";
import { withCurrentUser } from "@/server/auth/current-user";
import { listSubscriptions, notificationPrefs, pushConfig } from "@/server/services/push";
import { removeDeviceAction, saveNotificationPrefsAction } from "../actions";
import { ThisDevice } from "./this-device";

export const metadata: Metadata = { title: "Notifications" };

const KINDS = [
  { key: "reminders", label: "To-do reminders", hint: "At the reminder time you pick on a to-do." },
  { key: "bills", label: "Bills due tomorrow", hint: "Sent in the morning the day before." },
  { key: "budgetAlerts", label: "Budget alerts", hint: "When a category is heading over budget, with a fix. At most once a week per category." },
] as const;

export default async function NotificationSettings() {
  const { prefs, devices, tz } = await withCurrentUser(async (s, u) => ({
    prefs: notificationPrefs(u.preferences),
    devices: await listSubscriptions(s),
    tz: u.timezone,
  }));
  const available = !!pushConfig();
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-6">
        <h2 className="mb-1 text-[15px] font-semibold">This device</h2>
        <ThisDevice available={available} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-[15px] font-semibold">What to send</h2>
        <p className="mb-4 text-sm text-muted">Applies to every device where notifications are on.</p>
        <ActionForm action={saveNotificationPrefsAction} reset={false} className="gap-0">
          {KINDS.map((k) => (
            <label key={k.key} className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px]">{k.label}</span>
                <span className="block text-xs text-muted">{k.hint}</span>
              </span>
              <input type="checkbox" name={k.key} defaultChecked={prefs[k.key]} className="lf-switch" />
            </label>
          ))}
          <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px]">Morning brief</span>
              <span className="block text-xs text-muted">Safe to spend and your plan, once a day.</span>
            </span>
            <input
              type="time"
              name="briefTime"
              defaultValue={prefs.briefTime}
              aria-label="Morning brief time"
              className="h-11 rounded-xl border border-border bg-surface px-3 text-[16px]"
            />
            <input type="checkbox" name="morningBrief" defaultChecked={prefs.morningBrief} className="lf-switch" />
          </label>
          <SubmitButton className="mt-4 self-start">Save</SubmitButton>
        </ActionForm>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-[15px] font-semibold">Devices</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-muted">No devices yet. Turn notifications on above on each phone or computer you use.</p>
        ) : (
          <ul className="divide-y divide-border">
            {devices.map((d) => (
              <li key={d.id} className="flex min-h-14 items-center gap-3 py-2">
                <Smartphone className="h-5 w-5 shrink-0 text-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{d.deviceLabel ?? "Browser"}</span>
                  <span className="block text-xs text-muted">
                    Added {formatIn(d.createdAt, tz, "MMM d")}
                    {d.lastSuccessAt ? ` · last notification ${formatIn(d.lastSuccessAt, tz, "MMM d, h:mm a")}` : ""}
                  </span>
                </span>
                <ActionButton
                  action={removeDeviceAction.bind(null, d.id)}
                  title={`Remove ${d.deviceLabel ?? "this device"}`}
                  className="tap text-muted hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
