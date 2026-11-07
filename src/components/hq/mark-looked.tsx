"use client";
import { useEffect } from "react";

const cookie = (name: string, value: string, maxAge: number) => {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${value}; Path=/admin; Max-Age=${maxAge}; SameSite=Lax${secure}`;
};

/**
 * Remembers when the owner last looked at "Since you last looked" (ADR 0028, 0030). The Office refreshes itself every 15 s,
 * so the window is held for the whole visit: on the first render it keeps the window this visit uses (`visitName`, at most
 * 2 hours). When the owner leaves the page it writes the time they looked and lets the visit's window go, so the next
 * visit starts from now. Hiding the tab (another tab, another app) only writes the time: coming back is the same visit.
 */
export function MarkLooked({ name, visitName, visitValue }: { name: string; visitName: string; visitValue: string }) {
  useEffect(() => {
    if (!document.cookie.split("; ").some((c) => c.startsWith(`${visitName}=`))) cookie(visitName, visitValue, 2 * 60 * 60);
    const looked = () => cookie(name, String(Date.now()), 60 * 60 * 24 * 365);
    const leave = () => {
      looked();
      cookie(visitName, "", 0);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") looked();
    };
    // beforeunload runs before a reload's or a link's request is sent; pagehide covers phones, where it may not fire.
    window.addEventListener("beforeunload", leave);
    window.addEventListener("pagehide", leave);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("beforeunload", leave);
      window.removeEventListener("pagehide", leave);
      document.removeEventListener("visibilitychange", onHide);
      leave();
    };
  }, [name, visitName, visitValue]);
  return null;
}
