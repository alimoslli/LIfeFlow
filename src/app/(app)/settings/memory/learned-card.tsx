import { RotateCcw } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { Badge, Card, CardHeader } from "@/components/ui/surface";
import { KIND_LABELS } from "@/lib/jarvis-voice";
import { cn } from "@/lib/utils";
import type { learnedStats } from "@/server/services/proactive/engine";
import { resetLearningAction, setJarvisLearningAction, unmuteKindAction } from "../actions";

const label = (k: string) => KIND_LABELS[k] ?? k.replace(/_/g, " ");

/** What Jarvis learned from how the user responds, and the switches to change it. */
export function LearnedCard({
  name,
  learning,
  muted,
  stats,
}: {
  name: string;
  learning: boolean;
  muted: string[];
  stats: Awaited<ReturnType<typeof learnedStats>>;
}) {
  const kinds = stats.kinds.filter((k) => k.shown > 0).sort((a, b) => b.shown - a.shown);
  return (
    <Card>
      <CardHeader title={`What ${name} learned from you`} subtitle="From your Do it, Not now and ratings." />
      <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
        <div>
          <p className="text-sm font-medium">Learn from my responses</p>
          <p className="text-xs text-muted">Sends more of what you act on and stops what you keep skipping.</p>
        </div>
        <ActionButton
          action={setJarvisLearningAction.bind(null, !learning)}
          title={learning ? "Turn learning off" : "Turn learning on"}
          className="tap flex shrink-0 items-center justify-center"
        >
          <span className={cn("relative h-7 w-12 rounded-full transition-colors", learning ? "bg-accent" : "bg-surface-3")}>
            <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-[left]", learning ? "left-6" : "left-1")} />
          </span>
          <span className="sr-only">{learning ? "On" : "Off"}</span>
        </ActionButton>
      </div>
      {learning && (
        <ul className="divide-y divide-border">
          {stats.brief && <li className="px-5 py-3 text-sm">You prefer short messages, so {name} skips the small talk.</li>}
          {kinds.length === 0 && <li className="px-5 py-3 text-sm text-muted">Nothing yet. Respond to a few messages and it shows up here.</li>}
          {kinds.map((k) => (
            <li key={k.kind} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[15px]">{label(k.kind)}</p>
                <p className="text-xs text-muted">
                  Shown {k.shown} · acted on {k.acted} · skipped {k.negative}
                </p>
              </div>
              {k.suppressed ? (
                <Badge tone="neutral">Stopped</Badge>
              ) : k.boost > 0 ? (
                <Badge tone="success">More of these</Badge>
              ) : k.boost < 0 ? (
                <Badge tone="warning">Less often</Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {muted.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">You said don&apos;t suggest again</p>
          <ul className="mt-1">
            {muted.map((k) => (
              <li key={k} className="flex min-h-11 items-center justify-between gap-3">
                <span className="text-[15px]">{label(k)}</span>
                <ActionButton action={unmuteKindAction.bind(null, k)} className="rounded-full bg-surface-2 px-3 py-1.5 text-sm font-medium">
                  Bring back
                </ActionButton>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(learning || muted.length > 0) && (
        <div className="border-t border-border px-5 py-3">
          <ActionButton
            action={resetLearningAction}
            confirm="Forget what Jarvis learned from your responses and bring back everything you muted? Your memories stay."
            className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-text-2 hover:text-danger"
          >
            <RotateCcw className="h-4 w-4" /> Reset what {name} learned
          </ActionButton>
        </div>
      )}
    </Card>
  );
}
