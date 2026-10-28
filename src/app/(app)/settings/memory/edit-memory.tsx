"use client";
import { Pencil } from "lucide-react";
import { ActionForm } from "@/components/action-form";
import { SubmitButton } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/field";
import type { ActionState } from "@/server/actions";
import { CATEGORY_OPTIONS } from "./categories";

export function EditMemory({
  action,
  content,
  category,
  expires,
}: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  content: string;
  category: string;
  expires?: string;
}) {
  return (
    <Dialog
      trigger={<Pencil className="h-4 w-4" />}
      title="Edit memory"
      description="Your wording becomes what Jarvis uses."
      triggerProps={{ variant: "ghost", size: "icon", "aria-label": "Edit memory", title: "Edit memory" }}
    >
      {(close) => (
        <ActionForm action={action} onSuccess={close} reset={false}>
          <Field label="Memory" htmlFor="em-c">
            <Input id="em-c" name="content" required minLength={3} maxLength={500} defaultValue={content} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kind" htmlFor="em-k">
              <Select id="em-k" name="category" defaultValue={category}>
                {CATEGORY_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Expires (optional)" htmlFor="em-e">
              <Input id="em-e" name="expiresAt" type="date" defaultValue={expires} />
            </Field>
          </div>
          <SubmitButton className="self-start">Save</SubmitButton>
        </ActionForm>
      )}
    </Dialog>
  );
}
