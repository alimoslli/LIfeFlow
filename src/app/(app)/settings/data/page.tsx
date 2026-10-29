import type { Metadata } from "next";
import { Download } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Card } from "@/components/ui/surface";
import { requireUser } from "@/server/auth/current-user";
import { getDb } from "@/server/db/client";
import { accountHasPassword } from "@/server/services/accounts";
import { deleteAccountAction } from "../actions";
import { SettingsHeader } from "../settings-header";

export const metadata: Metadata = { title: "Privacy & data" };

export default async function DataSettings() {
  const user = await requireUser();
  const withPassword = await accountHasPassword(getDb(), user.id);
  return (
    <div className="flex flex-col gap-5">
      <SettingsHeader title="Privacy & data" />
      <Card className="p-5">
        <h2 className="font-medium">Export your data</h2>
        <p className="mt-1 text-sm text-text-2">A copy of everything LifeFlow keeps about you.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href="/api/export" className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-text">
            <Download className="h-4 w-4" /> Download my data
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
        <h2 className="font-medium">Your privacy</h2>
        <p className="mt-1 text-sm text-text-2">
          Your data is private to you, encrypted where it matters, and never used to train AI. Read the{" "}
          <a href="/privacy" className="text-accent underline underline-offset-2">
            Privacy Policy
          </a>{" "}
          and{" "}
          <a href="/terms" className="text-accent underline underline-offset-2">
            Terms
          </a>
          .
        </p>
      </Card>
      <Card className="border-danger/30 p-5">
        <h2 className="font-medium text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-text-2">Deletes your account and everything in it. This can&apos;t be undone.</p>
        <ActionForm action={deleteAccountAction} className="mt-4 max-w-sm">
          {withPassword && (
            <Field label="Password" htmlFor="del-pw">
              <Input id="del-pw" name="password" type="password" required autoComplete="current-password" />
            </Field>
          )}
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
