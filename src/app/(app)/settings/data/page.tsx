import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { deleteAccountAction } from "../actions";

export const metadata: Metadata = { title: "Privacy & data" };

export default function DataSettings() {
  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h2 className="font-medium">Export your data</h2>
        <p className="mt-1 text-sm text-text-2">
          Download everything LifeFlow stores about you as JSON — finances, school, work, calendar, tasks, notes, Jarvis conversations and memories. Integration
          credentials are never included.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/export" className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-text">
            <Download className="h-4 w-4" /> Full export (JSON)
          </a>
          <a
            href="/api/export?format=transactions.csv"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-5 text-sm font-medium shadow-soft"
          >
            Transactions (CSV)
          </a>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-medium">How your data is handled</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-2">
          <li>Your records are isolated by database row-level security; no other account can read them.</li>
          <li>Jarvis sends only the context needed for a request to OpenAI, with response storage disabled.</li>
          <li>Integration tokens are encrypted at rest and never shown to the browser or the AI.</li>
          <li>Sensitive actions are recorded in an audit log you can review under Security.</li>
        </ul>
      </Card>
      <Card className="border-danger/30 p-5">
        <h2 className="font-medium text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-text-2">Permanently deletes your account and all data. This cannot be undone — export first if you want a copy.</p>
        <ActionForm action={deleteAccountAction} className="mt-4 max-w-sm">
          <Field label="Password" htmlFor="del-pw">
            <Input id="del-pw" name="password" type="password" required autoComplete="current-password" />
          </Field>
          <Field label='Type "DELETE" to confirm' htmlFor="del-c">
            <Input id="del-c" name="confirm" required />
          </Field>
          <SubmitButton variant="danger" className="self-start">
            Delete my account
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
