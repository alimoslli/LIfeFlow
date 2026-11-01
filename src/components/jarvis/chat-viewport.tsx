"use client";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Keeps the Jarvis screen pinned to the part of the screen you can see, like a native
 * chat app: when the iPhone keyboard opens, the header stays at the top, the messages
 * shrink, and the box sits right on the keyboard, instead of iOS pushing the whole
 * page up. Uses the VisualViewport API (iOS Safari and home-screen apps don't resize
 * the page for the keyboard). Phones only; wide screens keep the normal layout.
 */
export function ChatViewport({ children, className }: { children: ReactNode; className?: string }) {
  const [keyboard, setKeyboard] = useState(false);
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    document.body.classList.add("lf-chat-lock");
    if (!vv) return () => document.body.classList.remove("lf-chat-lock");
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        root.style.setProperty("--vvh", `${vv.height}px`);
        root.style.setProperty("--vvt", `${vv.offsetTop}px`);
        setKeyboard(window.innerHeight - vv.height > 120);
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      document.body.classList.remove("lf-chat-lock");
      root.style.removeProperty("--vvh");
      root.style.removeProperty("--vvt");
    };
  }, []);
  return (
    <div className={cn("lf-chat-viewport", className)} data-keyboard={keyboard || undefined}>
      {children}
    </div>
  );
}
