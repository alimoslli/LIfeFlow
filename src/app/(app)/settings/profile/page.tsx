import type { Metadata } from "next";
import { cookies } from "next/headers";
import { TextSizePicker, ThemePicker, TodayModePicker } from "@/components/theme-picker";
import { TEXT_COOKIE, THEME_COOKIE, TODAY_COOKIE, parseTextSize, parseTheme, parseTodayMode } from "@/lib/theme";
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
import { FULL_NAME_MAX } from "@/lib/full-name";
import { BirthdayField } from "@/components/ui/birthday-field";

export const metadata: Metadata = { title: "You and the look" };

export default async function ProfileSettings() {
  const session = await requireUser({ account: true });
  const [u] = await getDb()
    .select({ name: users.name, fullName: users.fullName, email: users.email, timezone: users.timezone, preferences: users.preferences })
    .from(users)
    .where(eq(users.id, session.id));
  const zones = Intl.supportedValuesOf("timeZone");
  const jar = await cookies();
  const theme = parseTheme(jar.get(THEME_COOKIE)?.value);
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="You and the look" />
      <Card className="p-6">
        <h2 className="mb-4 text-[0.9375rem] font-semibold">Appearance</h2>
        <ThemePicker initial={theme} />
        <p className="mt-2 text-xs text-muted">System follows your phone&apos;s light or dark setting.</p>
        <h3 className="mt-5 mb-3 text-sm font-medium text-text-2">Text size</h3>
        <TextSizePicker initial={parseTextSize(jar.get(TEXT_COOKIE)?.value)} />
        <h3 className="mt-5 mb-3 text-sm font-medium text-text-2">Today&apos;s sky</h3>
        <TodayModePicker initial={parseTodayMode(jar.get(TODAY_COOKIE)?.value)} />
      </Card>
      <Card className="p-6">
        <h2 className="mb-4 text-[0.9375rem] font-semibold">Profile</h2>
        <ActionForm action={updateProfileAction} reset={false} showSuccess>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="What your skyling calls you" htmlFor="p-name">
              <Input id="p-name" name="name" defaultValue={u.name} required />
            </Field>
            <Field label="Full name (optional)" htmlFor="p-full">
              <Input id="p-full" name="fullName" defaultValue={u.fullName ?? ""} maxLength={FULL_NAME_MAX} autoComplete="name" />
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
            <Field label="Birthday" htmlFor="p-birth">
              <BirthdayField id="p-birth" name="birthDate" value={u.preferences.birthDate ?? ""} />
            </Field>
            <Field label="What fills your week" htmlFor="p-life">
              <Select id="p-life" name="lifeStage" defaultValue={u.preferences.lifeStage ?? "both"}>
                <option value="student">Classes</option>
                <option value="working">Work</option>
                <option value="both">Classes and a job</option>
                <option value="life">Neither</option>
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
