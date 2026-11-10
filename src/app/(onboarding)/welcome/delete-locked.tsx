"use client";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { deleteLockedAccountAction } from "./actions";

/** One tap deeper on the lock screen: delete the account (and the sign-in it still has), the same way Settings does. */
export function DeleteLocked({ withPassword }: { withPassword: boolean }) {
  return (
    <details className="group rounded-[1.25rem] bg-surface p-4 shadow-soft">
      <summary className="cursor-pointer list-none text-[0.9375rem] font-medium text-text-2 group-open:mb-3">Delete my account</summary>
      <p className="mb-3 text-sm text-text-2">This removes your email and sign-in too, so nothing is left. It can&apos;t be undone.</p>
      <ActionForm action={deleteLockedAccountAction} className="gap-3">
        {withPassword && (
          <Field label="Password" htmlFor="del-pw">
            <Input id="del-pw" name="password" type="password" required autoComplete="current-password" />
          </Field>
        )}
        <Field label='Type "DELETE" to confirm' htmlFor="del-c">
          <Input id="del-c" name="confirm" required autoComplete="off" />
        </Field>
        <SubmitButton variant="danger" className="self-start">
          Delete my account
        </SubmitButton>
      </ActionForm>
    </details>
  );
}
