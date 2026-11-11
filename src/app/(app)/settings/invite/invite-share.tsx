"use client";
import { useEffect, useState } from "react";
import { Share } from "lucide-react";
import { PixelIcon } from "@/components/pixel/pixel-icon";

/** The invite link, with Copy and (where the phone supports it) Share. */
export function InviteShare({ link, firstName, dark = false }: { link: string; firstName: string; /** on the night sky (the waitlist) */ dark?: boolean }) {
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
    navigator
      .share({
        title: "LifeFlow",
        text: `${firstName} invited you to LifeFlow, your whole week on one sky, with a little skyling who keeps an eye on it.`,
        url: link,
      })
      .catch(() => {});
  return (
    <div className="mt-5 flex flex-col gap-3">
      <label htmlFor="invite-link" className={dark ? "text-sm font-medium text-white/70" : "text-sm font-medium text-text-2"}>
        Your link
      </label>
      <input
        id="invite-link"
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className={
          dark
            ? "h-12 w-full min-w-0 rounded-2xl bg-white/10 px-4 text-[0.9375rem] text-white ring-1 ring-white/15"
            : "h-12 w-full min-w-0 rounded-2xl bg-surface-2 px-4 text-[0.9375rem] text-text"
        }
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="lf-sb lf-sb-sun lf-sb-sm">
          {copied ? <PixelIcon name="check" className="h-4 w-4" /> : <PixelIcon name="copy" className="h-4 w-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" onClick={share} className={dark ? "lf-sb lf-sb-glass lf-sb-sm" : "lf-sb lf-sb-app lf-sb-sm"}>
            <Share className="h-4 w-4" />
            Share
          </button>
        )}
      </div>
    </div>
  );
}
