import type { Metadata } from "next";
import { Bug, Lightbulb, MessageCircle } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { sendFeedbackAction } from "../actions";
import { SettingsHeader } from "../settings-header";

export const metadata: Metadata = { title: "Send feedback" };

const KINDS = [
  ["bug", "Something's broken", Bug],
  ["idea", "An idea", Lightbulb],
  ["other", "Something else", MessageCircle],
] as const;

/** Beta testers tell the owner what's broken or missing; a reply comes by email. */
export default function FeedbackPage() {
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Send feedback" />
      <p className="text-[0.9375rem] text-text-2">
        What&apos;s broken, confusing or missing? It goes straight to the person building LifeFlow, and they may reply by email.
      </p>
      <Card className="p-5">
        <ActionForm action={sendFeedbackAction} showSuccess className="flex flex-col gap-4">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="sr-only">What kind of feedback</legend>
            {KINDS.map(([value, label, Icon], i) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-medium text-text-2 transition-colors has-[:checked]:bg-hero has-[:checked]:text-hero-text has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40"
              >
                <input type="radio" name="kind" value={value} defaultChecked={i === 0} className="sr-only" />
                <Icon className="h-4 w-4" /> {label}
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-2">Your message</span>
            <textarea
              name="message"
              required
              minLength={3}
              maxLength={2000}
              rows={6}
              placeholder="What happened, or what would make LifeFlow better?"
              className="lf-composer rounded-2xl bg-surface-2 px-4 py-3 text-[1rem] leading-relaxed placeholder:text-muted focus:ring-2 focus:ring-accent/30 focus:outline-none"
            />
          </label>
          <SubmitButton className="self-start">Send</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
