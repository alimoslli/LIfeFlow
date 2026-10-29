"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { JarvisAvatar } from "@/components/jarvis/message-card";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { ASSISTANT_STYLES, ASSISTANT_VOICES, type AssistantProfile, type AssistantStyle } from "@/lib/assistant";
import { composeMessage, PREVIEW_SAMPLES } from "@/lib/jarvis-voice";
import type { ActionState } from "@/server/actions";

const chip =
  "cursor-pointer rounded-2xl bg-surface-2 px-3.5 py-2.5 text-left transition-all has-[:checked]:bg-hero has-[:checked]:text-hero-text has-[:checked]:shadow-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--ring)]";

export type PersonalitySettings = {
  frequency: "low" | "normal" | "high";
  quietStart: string;
  quietEnd: string;
  topics: Record<"money" | "school" | "work" | "health" | "habits", boolean>;
  autonomy: { tasks: boolean; calendar: boolean };
  avatar: "spark" | "orb" | "initial";
  learning: boolean;
  pushLimit: number;
  answerLength: "concise" | "balanced" | "detailed";
};

const TOPIC_LABELS = { money: "Money", school: "School", work: "Work", health: "Health", habits: "Habits" } as const;
const FREQ = { low: "Low: only what matters most", normal: "Normal: a few times a day", high: "High: everything useful" } as const;

function Switch({ name, label, hint, defaultChecked }: { name: string; label: string; hint?: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 py-1.5">
      <span className="min-w-0 flex-1">
        <span className="block text-[15px]">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="lf-switch" />
    </label>
  );
}

/** Name, tone, avatar, voice and how proactive the assistant is, with a live preview of how it will sound. */
export function AssistantCard({
  profile,
  settings,
  action,
}: {
  profile: AssistantProfile;
  settings: PersonalitySettings;
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const [name, setName] = useState(profile.name);
  const [style, setStyle] = useState<AssistantStyle>(profile.style);
  const [avatar, setAvatar] = useState(settings.avatar);
  return (
    <Card className="p-5" as="section">
      <h2 id="personality" className="scroll-mt-24 font-medium">
        Personality
      </h2>

      {/* Live preview */}
      <div className="mt-4 flex flex-col gap-2 rounded-3xl bg-surface-2 p-3" aria-live="polite" data-testid="personality-preview">
        <p className="px-1 text-xs font-medium text-muted">Preview</p>
        {PREVIEW_SAMPLES.map((p, i) => {
          const m = composeMessage(p.kind, p.facts, style === "friend" ? "friend" : style, { seed: i });
          return (
            <div key={p.kind} className="flex items-start gap-3 rounded-2xl bg-surface p-3 shadow-soft">
              <JarvisAvatar style={avatar} name={name || "J"} className="h-8 w-8" />
              <div className="min-w-0">
                <p className="text-xs text-muted">{name || "Jarvis"}</p>
                <p className="text-sm font-semibold">{m.title}</p>
                <p className="text-sm text-text-2">{m.body}</p>
              </div>
            </div>
          );
        })}
      </div>

      <ActionForm action={action} reset={false} className="mt-5 gap-5">
        <Field label="Name" htmlFor="as-name">
          <Input id="as-name" name="name" required maxLength={24} value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-2">Tone</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {Object.entries(ASSISTANT_STYLES).map(([key, s]) => (
              <label key={key} className={chip}>
                <input type="radio" name="style" value={key} checked={style === key} onChange={() => setStyle(key as AssistantStyle)} className="sr-only" />
                <span className="block text-sm font-medium">{s.label}</span>
                <span className="block text-xs opacity-75">{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field label="Answer length" htmlFor="as-len">
          <Select id="as-len" name="answerLength" defaultValue={settings.answerLength} className="max-w-xs">
            <option value="concise">Short</option>
            <option value="balanced">Balanced</option>
            <option value="detailed">Detailed</option>
          </Select>
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-2">Avatar</legend>
          <div className="flex gap-2">
            {(["spark", "orb", "initial"] as const).map((a) => (
              <label key={a} className={`${chip} flex items-center gap-2`}>
                <input type="radio" name="avatar" value={a} checked={avatar === a} onChange={() => setAvatar(a)} className="sr-only" />
                <JarvisAvatar style={a} name={name || "J"} className="h-7 w-7" />
                <span className="text-sm capitalize">{a === "initial" ? "Letter" : a}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text-2">How often he checks in</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(Object.keys(FREQ) as (keyof typeof FREQ)[]).map((f) => (
              <label key={f} className={chip}>
                <input type="radio" name="frequency" value={f} defaultChecked={settings.frequency === f} className="sr-only" />
                <span className="block text-sm font-medium capitalize">{f}</span>
                <span className="block text-xs opacity-75">{FREQ[f].split(": ")[1]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <Field label="Quiet from" htmlFor="as-qs">
            <Input id="as-qs" name="quietStart" type="time" defaultValue={settings.quietStart} />
          </Field>
          <Field label="Until" htmlFor="as-qe">
            <Input id="as-qe" name="quietEnd" type="time" defaultValue={settings.quietEnd} />
          </Field>
        </div>

        <Field label="Notifications a day (at most)" htmlFor="as-pl" hint="Only urgent or important things. 0 keeps everything in the app.">
          <select
            id="as-pl"
            name="pushLimit"
            defaultValue={String(settings.pushLimit)}
            className="h-11 max-w-[8rem] rounded-xl border border-border bg-surface px-3 text-[16px]"
          >
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </Field>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-text-2">Topics he can bring up</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-6">
            {(Object.keys(TOPIC_LABELS) as (keyof typeof TOPIC_LABELS)[]).map((t) => (
              <Switch key={t} name={`topic_${t}`} label={TOPIC_LABELS[t]} defaultChecked={settings.topics[t]} />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-text-2">Allowed without asking</legend>
          <Switch name="auto_tasks" label="Add to-dos and reminders, move late to-dos" defaultChecked={settings.autonomy.tasks} />
          <Switch name="auto_calendar" label="Block time on my calendar" defaultChecked={settings.autonomy.calendar} />
          <p className="text-xs text-muted">Anything with money, or contacting someone, always asks first. Everything he does on his own can be undone.</p>
        </fieldset>

        <Switch
          name="learning"
          label="Learn from how I respond"
          hint="He speaks up less about what you skip and more about what helps. Your answers stay in your account."
          defaultChecked={settings.learning}
        />

        <Field
          label="Anything else about his personality? (optional)"
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

        <SubmitButton className="self-start max-sm:h-12 max-sm:w-full">Save personality</SubmitButton>
      </ActionForm>
    </Card>
  );
}
