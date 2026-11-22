import type { Metadata } from "next";
import Link from "next/link";
import { PixelIcon } from "@/components/pixel/pixel-icon";
import { ActionButton, ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { assistantProfile, nameAtStart } from "@/lib/assistant";
import { formatIn } from "@/lib/dates";
import { pushSummary } from "@/lib/jarvis-voice";
import { HEADS_UP_CHOICES, headsUpMinutes } from "@/lib/heads-up";
import { withCurrentUser } from "@/server/auth/current-user";
import { jarvisSettings } from "@/server/services/proactive/engine";
import { listSubscriptions, notificationPrefs, pushConfig } from "@/server/services/push";
import { removeDeviceAction, saveNotificationPrefsAction } from "../actions";
import { ThisDevice } from "./this-device";
import { SettingsHeader } from "../settings-header";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationSettings() {
  const { prefs, devices, tz, headsUp, pushes } = await withCurrentUser(async (s, u) => ({
    prefs: notificationPrefs(u.preferences),
    devices: await listSubscriptions(s),
    tz: u.timezone,
    headsUp: headsUpMinutes(u.preferences),
    pushes: pushSummary(
      nameAtStart(assistantProfile(u.preferences, u.timezone).name),
      jarvisSettings(u.preferences),
      notificationPrefs(u.preferences).reminders,
      notificationPrefs(u.preferences).stars,
    ),
  }));
  const available = !!pushConfig();
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Notifications" />
      <Card className="p-6">
        <h2 className="mb-1 text-[0.9375rem] font-semibold">This device</h2>
        <ThisDevice available={available} />
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-[0.9375rem] font-semibold">What to send</h2>
        <ActionForm action={saveNotificationPrefsAction} reset={false} className="gap-0">
          <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem]">To-do reminders</span>
              <span className="block text-xs text-muted">At the reminder time you pick on a to-do.</span>
            </span>
            <input type="checkbox" name="reminders" defaultChecked={prefs.reminders} className="lf-switch" />
          </label>
          <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem]">Stars when something ends</span>
              <span className="block text-xs text-muted">A short note when a class, shift or plan ends. Never at night.</span>
            </span>
            <input type="checkbox" name="stars" defaultChecked={prefs.stars} className="lf-switch" />
          </label>
          <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-border py-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[0.9375rem]">Heads-up before things start</span>
              <span className="block text-xs text-muted">Before a class, shift or meeting with a time. Never in quiet hours.</span>
            </span>
            <select name="headsUp" defaultValue={headsUp} className="min-h-11 rounded-xl bg-surface px-3 text-sm" data-testid="heads-up-minutes">
              {HEADS_UP_CHOICES.map((m) => (
                <option key={m} value={m}>
                  {m ? `${m} min before` : "Off"}
                </option>
              ))}
            </select>
          </label>
          <p className="py-3 text-sm text-text-2">
            {pushes}{" "}
            <Link href="/settings/jarvis" className="font-medium text-accent">
              Change the limit or quiet hours
            </Link>
          </p>
          <SubmitButton className="mt-2 self-start">Save</SubmitButton>
        </ActionForm>
      </Card>

      <Card className="p-6">
        <h2 className="mb-1 text-[0.9375rem] font-semibold">Devices</h2>
        {devices.length === 0 ? (
          <p className="text-sm text-muted">No devices yet.</p>
        ) : (
          <ul className="lf-rows *:px-3">
            {devices.map((d) => (
              <li key={d.id} className="flex min-h-14 items-center gap-3 py-2">
                <PixelIcon name="bell" className="h-6 w-6" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9375rem]">{d.deviceLabel ?? "Browser"}</span>
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
                  <PixelIcon name="trash" className="h-4 w-4" />
                </ActionButton>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
