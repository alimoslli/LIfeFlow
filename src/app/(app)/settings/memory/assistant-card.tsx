"use client";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { ASSISTANT_STYLES, ASSISTANT_VOICES, type AssistantProfile } from "@/lib/assistant";
import type { ActionState } from "@/server/actions";

const chip =
  "cursor-pointer rounded-2xl bg-surface-2 px-3.5 py-2.5 text-left transition-all has-[:checked]:bg-hero has-[:checked]:text-hero-text has-[:checked]:shadow-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]";

/** Name, personality and voice of the user's assistant. */
export function AssistantCard({ profile, action }: { profile: AssistantProfile; action: (p: ActionState, fd: FormData) => Promise<ActionState> }) {
  return (
    <Card className="p-5">
      <h2 className="font-medium">Your assistant</h2>
      <p className="mt-1 text-sm text-text-2">Make it yours. The name, personality and voice change how it talks, not what it&apos;s allowed to do.</p>
      <ActionForm action={action} reset={false} showSuccess className="mt-4 gap-5">
        <Field label="Name" htmlFor="as-name">
          <Input id="as-name" name="name" required maxLength={24} defaultValue={profile.name} className="max-w-xs" />
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-2">Personality</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(ASSISTANT_STYLES).map(([key, s]) => (
              <label key={key} className={chip}>
                <input type="radio" name="style" value={key} defaultChecked={profile.style === key} className="sr-only" />
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-xs opacity-75">{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field
          label="Anything else about its personality? (optional)"
          htmlFor="as-notes"
          hint="For example: calls me 'boss', uses sports metaphors, keeps me calm before exams."
        >
          <Textarea id="as-notes" name="notes" rows={2} maxLength={300} defaultValue={profile.notes ?? ""} />
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-2">Voice for live conversations</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {Object.entries(ASSISTANT_VOICES).map(([key, desc]) => (
              <label key={key} className={chip}>
                <input type="radio" name="voice" value={key} defaultChecked={profile.voice === key} className="sr-only" />
                <span className="block text-sm font-medium capitalize">{key}</span>
                <span className="block text-xs opacity-75">{desc}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <SubmitButton className="self-start">Save</SubmitButton>
      </ActionForm>
    </Card>
  );
}
