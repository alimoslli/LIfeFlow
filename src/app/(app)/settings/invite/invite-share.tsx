"use client";
import { useEffect, useState } from "react";
import { Check, Copy, Share } from "lucide-react";

/** The invite link, with Copy and (where the phone supports it) Share. */
export function InviteShare({ link, firstName }: { link: string; firstName: string }) {
  const [copied, setCopied] = useState(false);
  // Known only in the browser, so it's checked after the first render.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setCanShare(typeof navigator.share === "function"), 0);
    return () => clearTimeout(id);
  }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  const share = () =>
    navigator.share({ title: "LifeFlow", text: `${firstName} invited you to LifeFlow, a personal planner and AI assistant.`, url: link }).catch(() => {});
  return (
    <div className="mt-5 flex flex-col gap-3">
      <label htmlFor="invite-link" className="text-sm font-medium text-text-2">
        Your link
      </label>
      <input
        id="invite-link"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="h-12 w-full min-w-0 rounded-2xl bg-surface-2 px-4 text-[0.9375rem] text-text"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-medium text-accent-text shadow-soft hover:bg-accent-hover"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" onClick={share} className="flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-5 text-sm font-medium text-text">
            <Share className="h-4 w-4" />
            Share
          </button>
        )}
      </div>
    </div>
  );
}
