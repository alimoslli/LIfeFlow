"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Fingerprint, KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { ActionButton, ActionForm } from "@/components/action-form";
import { addPasskey, biometricName, PasskeyCancelled, passkeysSupported } from "@/components/auth/passkey-client";
import { Button, SubmitButton } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import { Card } from "@/components/ui/surface";
import { toast } from "@/components/ui/toaster";
import { removePasskeyAction, renamePasskeyAction } from "./passkey-actions";

export type PasskeyRow = { id: string; name: string; created: string; lastUsed: string | null; synced: boolean };

/** Settings list of passkeys: add (Face ID / Touch ID), rename, remove, and when each was last used. */
export function PasskeysCard({ passkeys, demo }: { passkeys: PasskeyRow[]; demo: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<PasskeyRow | null>(null);

  const add = async () => {
    if (!passkeysSupported()) return toast("This browser can't create passkeys.", { tone: "danger" });
    setAdding(true);
    try {
      const r = await addPasskey();
      toast(`Passkey added: ${r.passkey.name}. Next time, sign in with ${biometricName()}.`);
      router.refresh();
    } catch (e) {
      if (!(e instanceof PasskeyCancelled)) toast(e instanceof Error ? e.message : "Couldn't add the passkey.", { tone: "danger" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Fingerprint className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-medium">Passkeys (Face ID, Touch ID)</h2>
          <p className="mt-0.5 text-sm text-text-2">
            Sign in with your face or fingerprint instead of a password. Your fingerprint or face never leaves your device; LifeFlow only stores a public key.
          </p>
        </div>
      </div>
      {passkeys.length > 0 && (
        <ul className="mt-4 divide-y divide-border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex min-h-14 items-center gap-3 py-2">
              <KeyRound className="h-4 w-4 shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] break-words">{p.name}</span>
                <span className="block text-xs text-muted">
                  Added {p.created} · {p.lastUsed ? `last used ${p.lastUsed}` : "not used yet"}
                  {p.synced ? " · synced with your other devices" : ""}
                </span>
              </span>
              <button
                type="button"
                onClick={() => setRenaming(p)}
                aria-label={`Rename ${p.name}`}
                className="tap flex items-center justify-center text-muted hover:text-text"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <ActionButton
                action={removePasskeyAction.bind(null, p.id)}
                confirm={`Remove "${p.name}"? You won't be able to sign in with it anymore.`}
                title={`Remove ${p.name}`}
                className="tap flex items-center justify-center text-muted hover:text-danger"
              >
                <Trash2 className="h-4 w-4" />
              </ActionButton>
            </li>
          ))}
        </ul>
      )}
      {demo ? (
        <p className="mt-4 text-sm text-muted">The shared test account can&apos;t add passkeys.</p>
      ) : (
        <Button onClick={add} loading={adding} className="mt-4 min-h-11">
          <Plus className="h-4 w-4" /> {passkeys.length ? "Add another passkey" : "Add a passkey"}
        </Button>
      )}

      <Sheet open={!!renaming} onClose={() => setRenaming(null)} title="Rename passkey">
        {renaming && (
          <ActionForm
            key={renaming.id}
            action={renamePasskeyAction.bind(null, renaming.id)}
            reset={false}
            onSuccess={() => setRenaming(null)}
            className="gap-4"
          >
            <Field label="Name" htmlFor="pk-name">
              <Input id="pk-name" name="name" defaultValue={renaming.name} maxLength={60} required className="h-12 text-[16px]" />
            </Field>
            <SubmitButton className="h-12 w-full">Save</SubmitButton>
          </ActionForm>
        )}
      </Sheet>
    </Card>
  );
}
