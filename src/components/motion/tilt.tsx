"use client";
import { useEffect } from "react";
import { gsap, prefersReducedMotion } from "./gsap";

const MAX_DEG = 5;

/**
 * 3D depth for cards marked `data-tilt`: with a mouse they lean toward the
 * pointer; on touch they press in toward the finger and spring back. One
 * delegated listener for the whole app, so cards need no wrapper component.
 */
export function TiltLayer() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let current: HTMLElement | null = null;
    const lean = (el: HTMLElement, e: PointerEvent, depth: number, scale: number) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      // Big cards lean less, so wide panels don't swing.
      const k = Math.min(1, 320 / Math.max(r.width, 1)) * depth;
      gsap.to(el, {
        rotateY: x * MAX_DEG * 2 * k,
        rotateX: -y * MAX_DEG * 2 * k,
        scale,
        transformPerspective: 900,
        duration: 0.35,
        ease: "power2.out",
        overwrite: "auto",
      });
    };
    const settle = (el: HTMLElement) => gsap.to(el, { rotateX: 0, rotateY: 0, scale: 1, duration: 0.6, ease: "elastic.out(1, 0.6)", overwrite: "auto" });
    const target = (e: PointerEvent) => (e.target as Element | null)?.closest<HTMLElement>("[data-tilt]") ?? null;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const el = target(e);
      if (current && current !== el) settle(current);
      current = el;
      if (el) lean(el, e, 1, 1.01);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      const el = target(e);
      if (!el) return;
      current = el;
      lean(el, e, 0.8, 0.98);
    };
    const onUp = () => {
      if (current) settle(current);
      current = null;
    };
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { passive: true });
    document.addEventListener("pointerup", onUp, { passive: true });
    document.addEventListener("pointercancel", onUp, { passive: true });
    document.addEventListener("pointerleave", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.removeEventListener("pointerleave", onUp);
    };
  }, []);
  return null;
}
