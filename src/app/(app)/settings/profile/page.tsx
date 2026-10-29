import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AccentPicker, ThemePicker } from "@/components/theme-picker";
import { ACCENT_COOKIE, THEME_COOKIE, parseAccent, parseTheme } from "@/lib/theme";
import { eq } from "drizzle-orm";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { updateProfileAction } from "../actions";
import { SettingsHeader } from "../settings-header";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfileSettings() {
  const session = await requireUser();
  const [u] = await getDb()
    .select({ name: users.name, email: users.email, timezone: users.timezone, preferences: users.preferences })
    .from(users)
    .where(eq(users.id, session.id));
  const zones = Intl.supportedValuesOf("timeZone");
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  const accent = parseAccent(jar.get(ACCENT_COOKIE)?.value);
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Profile & appearance" />
      <Card className="p-6">
        <h2 className="mb-4 text-[15px] font-semibold">Appearance</h2>
        <ThemePicker initial={theme} />
        <h3 className="mt-5 mb-3 text-sm font-medium text-text-2">Accent color</h3>
        <AccentPicker initial={accent} />
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 text-[15px] font-semibold">Profile</h2>
        <ActionForm action={updateProfileAction} reset={false} showSuccess>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="p-name">
              <Input id="p-name" name="name" defaultValue={u.name} required />
            </Field>
            <Field label="Email" htmlFor="p-email">
              <Input id="p-email" value={u.email} disabled readOnly />
            </Field>
            <Field label="Time zone" htmlFor="p-tz">
              <Select id="p-tz" name="timezone" defaultValue={u.timezone}>
                {zones.map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Week starts on" htmlFor="p-week">
              <Select id="p-week" name="weekStartsOn" defaultValue={String(u.preferences.weekStartsOn ?? 1)}>
                <option value="1">Monday</option>
                <option value="0">Sunday</option>
              </Select>
            </Field>
            <Field label="Preferred study time" htmlFor="p-study">
              <Select id="p-study" name="studyTime" defaultValue={u.preferences.studyTime ?? ""}>
                <option value="">No preference</option>
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
                <option value="night">Night</option>
              </Select>
            </Field>
          </div>
          <SubmitButton className="self-start">Save</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
