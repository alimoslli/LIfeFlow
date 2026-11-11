import { pixel } from "@/components/pixel/pixel-icon";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Card } from "@/components/ui/surface";
import { sendFeedbackAction } from "../actions";

const KINDS = [
  ["bug", "Something's broken", pixel("alert")],
  ["idea", "An idea", pixel("idea")],
  ["other", "Something else", pixel("chat")],
] as const;

/**
 * Feedback, on the same page as inviting friends (it was its own page; owner's page map 2026-11-10). Testers tell the owner
 * what's broken or missing; a reply comes by email.
 */
export function FeedbackCard() {
  return (
    <section id="feedback" aria-label="Send feedback" className="scroll-mt-24">
      <Card className="p-5">
        <h2 className="font-display text-[1.375rem] leading-tight font-medium tracking-tight">Tell us what to fix</h2>
        <p className="mt-1 mb-4 text-[0.9375rem] text-text-2">It goes straight to the builder.</p>
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
              rows={5}
              placeholder="What happened, or what would make LifeFlow better?"
              className="lf-composer rounded-2xl bg-surface-2 px-4 py-3 text-[1rem] leading-relaxed placeholder:text-muted focus:ring-2 focus:ring-accent/30 focus:outline-none"
            />
          </label>
          <SubmitButton className="self-start">Send</SubmitButton>
        </ActionForm>
      </Card>
    </section>
  );
}
