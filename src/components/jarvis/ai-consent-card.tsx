"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { setAiConsentAction } from "@/app/(app)/settings/actions";

/** Asked once, before anything goes to the AI provider (App Store 5.1.2(i)). Turn it off anytime in Settings. */
export function AiConsentCard({ name }: { name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="mt-6 w-full rounded-[24px] bg-surface p-5 text-left shadow-soft ring-1 ring-border/60" role="region" aria-label="Allow AI">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
          <ShieldCheck className="h-[18px] w-[18px]" />
        </span>
        <p className="text-[16px] font-semibold">Before we start</p>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-text-2">
        To answer, {name} sends your message and the parts of your LifeFlow data it needs (like tasks, classes or transactions) to OpenAI, our AI provider. They
        don&apos;t use it to train their models. You can turn this off anytime in Settings.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              await setAiConsentAction(true);
              router.refresh();
            })
          }
          className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-[15px] font-medium text-accent-text disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />} Allow
        </button>
        <Link href="/privacy#ai" className="flex min-h-11 items-center px-2 text-[14px] text-muted hover:text-text">
          How we protect it
        </Link>
      </div>
    </div>
  );
}
