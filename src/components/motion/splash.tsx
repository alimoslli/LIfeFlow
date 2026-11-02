"use client";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { gsap, MOTION } from "./gsap";
import { markHydrated, setSplashActive } from "./intro";

const SESSION_KEY = "lf_splash_shown";
/** The signed-in user's first name, remembered on this device for the greeting. */
export const NAME_KEY = "lf_first_name";

/**
 * Runs before first paint (inline in <body>): shows the splash once per
 * session, never with reduced motion, and not under automation (tests)
 * unless forced with ?splash=1. Uses a class on <html> so there's no flash.
 */
export const SPLASH_SCRIPT = `try{var q=location.search,s=sessionStorage;if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&(/[?&]splash=1/.test(q)||(!s.getItem("${SESSION_KEY}")&&!navigator.webdriver&&!/[?&]nosplash/.test(q)))){var r=document.documentElement,h=new Date().getHours(),n="";try{n=(localStorage.getItem("${NAME_KEY}")||"").slice(0,24)}catch(e){}r.style.setProperty("--lf-greet",JSON.stringify(h<5?"Up late":h<12?"Good morning":h<17?"Good afternoon":"Good evening"));r.style.setProperty("--lf-name",JSON.stringify(n||"Welcome back"));r.classList.add("lf-splash");s.setItem("${SESSION_KEY}","1")}}catch(e){}`;

const MIN_VISIBLE_MS = 1500;
/** Never longer than this, even on a very slow connection. */
const MAX_VISIBLE_MS = 8000;

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, Math.max(0, ms)));

/** Resolves when the page behind the splash is really there: no loading placeholder left, everything loaded. */
function pageReady() {
  return new Promise<void>((resolve) => {
    const ready = () => document.readyState === "complete" && !document.querySelector("[data-app-loading]");
    if (ready()) return resolve();
    const check = () => {
      if (!ready()) return;
      observer.disconnect();
      window.removeEventListener("load", check);
      resolve();
    };
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("load", check);
  });
}

/**
 * Opening screen: the official LifeFlow mark appears, then "Good morning" and
 * the user's first name rise into focus (CSS, set before first paint from the
 * device clock, so no flicker). It stays until the app has really loaded (the
 * page's data is in, no loading placeholder, fonts and images done), so people
 * don't land on a half-loaded screen; at least 1.5s, never more than 8s. A CSS
 * failsafe hides it after 9.5s even if JavaScript never runs.
 */
export function Splash() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    markHydrated();
    const root = document.documentElement;
    const el = layer.current;
    if (!el || !root.classList.contains("lf-splash")) return;
    setSplashActive(true);
    const finish = () => {
      root.classList.remove("lf-splash");
      setSplashActive(false);
    };
    let tl: gsap.core.Timeline | null = null;
    let gone = false;
    const leave = () => {
      if (gone) return;
      gone = true;
      tl = gsap.timeline({ onComplete: finish });
      tl.to(el.querySelector(".lf-splash-inner"), { scale: 1.06, opacity: 0, duration: 0.35, ease: "power2.in" }).to(
        el,
        { opacity: 0, duration: 0.4, ease: MOTION.ease },
        "-=0.15",
      );
    };
    const sinceStart = performance.now();
    Promise.race([
      Promise.all([pageReady(), document.fonts?.ready ?? Promise.resolve(), wait(MIN_VISIBLE_MS - sinceStart)]),
      wait(MAX_VISIBLE_MS - sinceStart),
    ]).then(leave, leave);
    const safety = window.setTimeout(finish, MAX_VISIBLE_MS + 1000);
    return () => {
      gone = true;
      tl?.kill();
      window.clearTimeout(safety);
      finish();
    };
  }, []);

  return (
    <div ref={layer} className="lf-splash-layer" aria-hidden>
      <div className="lf-splash-inner flex flex-col items-center gap-5">
        <Image
          src="/brand/lifeflow-mark-transparent-512.png"
          alt=""
          width={132}
          height={132}
          priority
          className="lf-splash-brand h-[112px] w-[112px] drop-shadow-[0_10px_28px_rgba(0,0,0,0.28)]"
        />
        <div className="flex flex-col items-center text-center">
          <p className="lf-greet lf-greet-1 text-[0.9375rem] tracking-[0.18em] uppercase opacity-80" />
          <p className="lf-greet lf-greet-2 mt-2 font-display text-[2.5rem] leading-none font-medium tracking-tight" />
          <span className="lf-greet-line mt-5 h-px w-16 bg-white/50" />
        </div>
      </div>
    </div>
  );
}
