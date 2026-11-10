import { useEffect } from "react";

let holders = 0;

/**
 * While `active`, the app is in the middle of something a reload would cut off: a voice call, a reply streaming,
 * a file uploading. The check that keeps an open app on the live version waits (components/pwa/app-updater.tsx).
 */
export function useAppBusy(active: boolean) {
  useEffect(() => {
    if (!active) return;
    holders++;
    document.documentElement.dataset.lfBusy = "1";
    return () => {
      holders = Math.max(0, holders - 1);
      if (!holders) delete document.documentElement.dataset.lfBusy;
    };
  }, [active]);
}

export const appBusy = () => document.documentElement.dataset.lfBusy === "1";
