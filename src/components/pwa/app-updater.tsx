"use client";
import { useEffect } from "react";
import { appBusy } from "@/lib/app-busy";
import { updateDecision } from "@/lib/app-version";

const EVERY_MS = 5 * 60_000;
const KEY = "lf-reloaded-for";

type Field = HTMLInputElement | HTMLTextAreaElement;

/** Fields the person typed in and hasn't sent yet. A field that's gone from the page or empty again no longer counts. */
const typed = new Set<Field>();
const NOT_TEXT = new Set(["checkbox", "radio", "range", "color", "button", "submit", "reset", "hidden"]);

function unsent() {
  let any = false;
  for (const el of typed) {
    if (el.isConnected && el.value.trim()) any = true;
    else typed.delete(el);
  }
  return any;
}

/**
 * Never reload over something the person is in the middle of: an open sheet, a field in use, anything typed and not
 * yet sent (a draft, a half-filled form), or work in flight (a voice call, a reply streaming, an upload).
 */
function quiet() {
  if (appBusy()) return false;
  if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return false;
  const a = document.activeElement;
  if (a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement || (a instanceof HTMLElement && a.isContentEditable))
    return false;
  if (unsent()) return false;
  for (const el of document.querySelectorAll<HTMLTextAreaElement>("textarea")) if (el.value.trim()) return false;
  return true;
}

/**
 * Keeps an open app on the live version (owner's phone, 2026-11-10: the installed app showed yesterday's tabs and
 * buttons hours after they had changed). When the app comes back to the front it asks which build is live, at most
 * every five minutes; if it is behind, it reloads once, at that moment and only when nothing is in progress. It
 * never reloads while someone is using the app, and never twice for the same build.
 */
export function AppUpdater() {
  useEffect(() => {
    const mine = document.documentElement.dataset.build ?? "";
    if (!mine) return; // a local build has no build id
    let asked = 0;
    let live: string | null = null;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      if (!live || live === mine) {
        if (Date.now() - asked < EVERY_MS) return;
        asked = Date.now();
        try {
          const res = await fetch("/api/version", { cache: "no-store" });
          if (!res.ok) return;
          live = ((await res.json()) as { v?: string }).v ?? null;
        } catch {
          return;
        }
      }
      let reloadedFor: string | null = null;
      try {
        reloadedFor = sessionStorage.getItem(KEY);
      } catch {}
      if (updateDecision(mine, live, reloadedFor) !== "reload" || !quiet()) return;
      try {
        sessionStorage.setItem(KEY, live!);
      } catch {
        return; // without the mark we can't promise not to loop
      }
      window.location.reload();
    };
    const onShow = () => void check();
    // typing in a field marks it; sending the form it is in clears that form's marks
    const onType = (e: Event) => {
      const el = e.target;
      if (!(el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && !NOT_TEXT.has(el.type)))) return;
      if (typed.size >= 20) unsent(); // drops the ones that are gone or empty, so the list stays short
      typed.add(el);
    };
    const onSend = (e: Event) => {
      for (const el of typed) if (el.form === e.target) typed.delete(el);
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", onShow);
    document.addEventListener("input", onType, true);
    document.addEventListener("submit", onSend, true);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", onShow);
      document.removeEventListener("input", onType, true);
      document.removeEventListener("submit", onSend, true);
    };
  }, []);
  return null;
}
