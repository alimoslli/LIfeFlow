"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The Jarvis screen on phones, like a native chat app: when the keyboard opens, the page
 * stays still and only the message bar slides up with it; the header and chat stay put.
 *
 * iOS doesn't resize web pages for the keyboard. It scrolls the whole page up to show
 * the focused field, which is the jump people see. So:
 * 1. The page can't scroll (html/body fixed while this screen is open).
 * 2. A tap on the message bar first focuses an invisible field at the top of the screen.
 *    The keyboard opens, and iOS has nothing to scroll because that field is already in view.
 * 3. The bar slides up by the keyboard's height (remembered from last time, so it moves with
 *    the keyboard), then focus moves to the real box, now above the keyboard. Anything typed
 *    in between is carried over.
 * 4. The keyboard's real height comes from the VisualViewport API; if iOS pans anyway, the
 *    page is put back. The tab bar hides while typing.
 * Wide screens keep the normal layout (the CSS is phone-only).
 */

const KB_KEY = "lf-kb-height";
const SLIDE_MS = 300;

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function remembered() {
  try {
    return Number(localStorage.getItem(KB_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function ChatViewport({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const proxyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    const proxy = proxyRef.current;
    if (!el || !proxy) return;
    const root = document.documentElement;
    const vv = window.visualViewport;
    root.classList.add("lf-chat-lock");

    let kb = 0;
    let pending: HTMLTextAreaElement | null = null;
    let timer = 0;

    const scroller = () => el.querySelector<HTMLElement>("[data-chat-scroll]");
    const apply = (h: number) => {
      if (h === kb) return;
      // Keep the latest message in view while the chat gets shorter.
      const s = scroller();
      const atBottom = !!s && s.scrollHeight - s.scrollTop - s.clientHeight < 80;
      kb = h;
      root.style.setProperty("--kb", `${h}px`);
      el.toggleAttribute("data-keyboard", h > 0);
      document.body.toggleAttribute("data-keyboard", h > 0);
      if (atBottom && s) {
        const stick = () => (s.scrollTop = s.scrollHeight);
        requestAnimationFrame(stick);
        window.setTimeout(stick, SLIDE_MS + 20);
      }
    };

    /** Moves focus from the invisible field to the message box, with anything typed in between. */
    const handoff = () => {
      window.clearTimeout(timer);
      const field = pending;
      pending = null;
      if (!field) return;
      if (proxy.value) {
        const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
        setValue?.call(field, field.value + proxy.value);
        field.dispatchEvent(new Event("input", { bubbles: true }));
        proxy.value = "";
      }
      field.focus({ preventScroll: true });
      const end = field.value.length;
      field.setSelectionRange(end, end);
    };

    const measure = () => {
      if (!vv) return;
      // If iOS panned the page anyway, put it back: only the bar should move.
      if (vv.offsetTop > 0) window.scrollTo(0, 0);
      const h = Math.max(0, Math.round(Math.max(window.innerHeight, root.clientHeight) - vv.height));
      const open = h > 120;
      if (open) {
        try {
          localStorage.setItem(KB_KEY, String(h));
        } catch {}
      }
      const moved = (open ? h : 0) !== kb;
      apply(open ? h : 0);
      // The keyboard is up: once the bar has slid above it, give the box focus.
      if (open && pending) {
        window.clearTimeout(timer);
        timer = window.setTimeout(handoff, moved ? SLIDE_MS : 0);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      const field = (e.target as HTMLElement | null)?.closest?.<HTMLTextAreaElement>(".lf-composer textarea");
      if (!field || field.disabled || document.activeElement === field || !window.matchMedia("(max-width: 767px)").matches) return;
      e.preventDefault(); // no native focus: that's what makes iOS push the page up
      pending = field;
      proxy.focus({ preventScroll: true });
      const guess = remembered();
      if (guess) apply(guess); // slide with the keyboard instead of after it
      timer = window.setTimeout(handoff, guess ? SLIDE_MS + 20 : 700); // in case the size event never comes
    };

    measure();
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    const ios = isIOS();
    if (ios) el.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      window.clearTimeout(timer);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      if (ios) el.removeEventListener("touchend", onTouchEnd);
      root.classList.remove("lf-chat-lock");
      root.style.removeProperty("--kb");
      document.body.removeAttribute("data-keyboard");
    };
  }, []);

  return (
    <div ref={ref} className={cn("lf-chat-viewport", className)}>
      {/* Opens the keyboard without iOS scrolling the page (see above). Never visible, never in the tab order. */}
      <input
        ref={proxyRef}
        className="lf-kb-proxy"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        autoCorrect="on"
        enterKeyHint="send"
        aria-label="Message"
      />
      {children}
    </div>
  );
}
