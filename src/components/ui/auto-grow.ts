"use client";
import { useLayoutEffect, type RefObject } from "react";

/**
 * A text box that grows with what's typed, up to its CSS max-height, then scrolls inside (owner, 2026-11-11: "when I send
 * a lot of text into the chat box, especially on the phone, I can't see the rest of it"). Done here rather than with
 * `field-sizing: content` because Safari on the iPhone doesn't grow a box that way. `onGrow` hears how many pixels taller
 * than one line it is now.
 */
export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string, onGrow?: (px: number) => void) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      const one = el.offsetHeight; // one line, from rows={1}
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
      onGrow?.(Math.max(0, el.offsetHeight - one));
    };
    fit();
    const ro = new ResizeObserver(() => {
      // a new width can rewrap the text; only refit when the width changed, so our own height change doesn't loop
      if (el.dataset.w !== String(el.clientWidth)) {
        el.dataset.w = String(el.clientWidth);
        fit();
      }
    });
    el.dataset.w = String(el.clientWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, value, onGrow]);
}
