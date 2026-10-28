"use client";
import { useActionState } from "react";
import { Copy, HeartPulse } from "lucide-react";
import { ActionButton } from "@/components/action-form";
import { Button, SubmitButton } from "@/components/ui/button";
import { FormError, Input } from "@/components/ui/field";
import { Badge, Card } from "@/components/ui/surface";
import { createHealthKeyAction, revokeHealthKeyAction } from "./actions";

type Key = { id: string; name: string; created: string; lastUsed: string | null };

const BODY_EXAMPLE = `{
  "metrics": {
    "steps": 8532,
    "activeEnergy": 412,
    "restingHeartRate": 61,
    "weightLb": 172.4
  }
}`;

/** Apple Health has no web API, so the user's own iOS Shortcut sends daily totals with a personal key. */
export function AppleHealthCard({ keys, lastReceived, url }: { keys: Key[]; lastReceived: string | null; url: string }) {
  const [state, action] = useActionState(createHealthKeyAction, null);
  const copy = (s: string) => navigator.clipboard?.writeText(s);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2">
            <HeartPulse className="h-5 w-5 text-accent" />
          </span>
          <div>
            <h2 className="font-medium">Apple Health</h2>
            <p className="text-xs text-muted">Health · via an iPhone Shortcut</p>
          </div>
        </div>
        <Badge tone={lastReceived ? "success" : "neutral"}>{lastReceived ? "Receiving data" : keys.length ? "Waiting for data" : "Not set up"}</Badge>
      </div>
      <p className="mt-3 text-sm text-text-2">
        Apple keeps Health data on your iPhone and offers no web connection, so you send it yourself with a Shortcut that runs once a day. You choose exactly
        which numbers it sends. Your assistant can then answer questions like &quot;how did I sleep this week?&quot;
        {lastReceived && <> Last data received {lastReceived}.</>}
      </p>

      {state?.token ? (
        <div className="mt-4 flex flex-col gap-2 rounded-2xl bg-success-soft p-4">
          <p className="text-sm font-medium text-success">Your new key (shown only once)</p>
          <code className="break-all rounded-lg bg-surface px-3 py-2 text-xs">{state.token}</code>
          <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => copy(state.token!)}>
            <Copy className="h-3.5 w-3.5" /> Copy key
          </Button>
        </div>
      ) : (
        <form action={action} className="mt-4 flex flex-wrap items-end gap-2">
          {state && !state.ok && <FormError message={state.error} />}
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="text-muted">Key name</span>
            <Input name="name" defaultValue="My iPhone" maxLength={60} />
          </label>
          <SubmitButton pendingText="Creating…">Create a key</SubmitButton>
        </form>
      )}

      {keys.length > 0 && (
        <ul className="mt-4 flex flex-col divide-y divide-border text-sm">
          {keys.map((k) => (
            <li key={k.id} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="line-clamp-2 break-words">{k.name}</span>
                <span className="text-xs text-muted">
                  Created {k.created} · {k.lastUsed ? `last used ${k.lastUsed}` : "never used"}
                </span>
              </span>
              <ActionButton
                action={revokeHealthKeyAction.bind(null, k.id)}
                confirm={`Revoke "${k.name}"? Shortcuts using it will stop sending data.`}
                title={`Revoke ${k.name}`}
                className="shrink-0 text-sm text-muted hover:text-danger"
              >
                Revoke
              </ActionButton>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-4 rounded-2xl bg-surface-2 p-4 text-sm">
        <summary className="cursor-pointer font-medium">How to set up the Shortcut (about 5 minutes)</summary>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-text-2">
          <li>Create a key above and copy it.</li>
          <li>
            On your iPhone, open <strong>Shortcuts</strong>, tap <strong>+</strong>, and name it &quot;LifeFlow Health&quot;.
          </li>
          <li>
            Add <strong>Find Health Samples</strong>: Type <em>Steps</em>, Start Date <em>is today</em>. Then add <strong>Calculate Statistics</strong> set to{" "}
            <em>Sum</em>. Repeat for <em>Active Energy</em> (Sum), <em>Resting Heart Rate</em> (Average) and <em>Weight</em> (sort by latest, limit 1) if you
            want them.
          </li>
          <li>
            Add <strong>Get Contents of URL</strong> with this URL:
            <span className="mt-1 flex items-center gap-2">
              <code className="break-all rounded-lg bg-surface px-2 py-1 text-xs">{url}</code>
              <button
                type="button"
                onClick={() => copy(url)}
                title="Copy URL"
                aria-label="Copy URL"
                className="tap flex shrink-0 items-center justify-center text-accent"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </span>
          </li>
          <li>
            Tap <strong>Show More</strong>: Method <em>POST</em>. Add a header <code>Authorization</code> with the value <code>Bearer</code>, a space, then your
            key. Request Body <em>JSON</em>: add a field <code>metrics</code> of type <em>Dictionary</em>, and inside it one Number field per value, picking the
            matching Statistics result as the value.
          </li>
          <li>
            Run it once. You should see <code>{`"ok": true`}</code>. Then open the <strong>Automation</strong> tab, tap <strong>+</strong>, choose{" "}
            <strong>Time of Day</strong> (for example 9:00 PM, Daily), pick <strong>Run Immediately</strong>, and select your shortcut.
          </li>
        </ol>
        <p className="mt-3 text-text-2">
          Field names you can send: <code>steps</code>, <code>activeEnergy</code> (kcal), <code>exerciseMinutes</code>, <code>sleepHours</code> or{" "}
          <code>sleepMinutes</code>, <code>restingHeartRate</code>, <code>weightKg</code> or <code>weightLb</code>, <code>distanceKm</code> or{" "}
          <code>distanceMi</code>, <code>mindfulMinutes</code>. Add <code>&quot;date&quot;: &quot;YYYY-MM-DD&quot;</code> to send a past day. Sending the same
          day again replaces it. Example body:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-surface p-3 text-xs">{BODY_EXAMPLE}</pre>
      </details>
    </Card>
  );
}
