"use client";
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

/**
 * Opening screen: the LifeFlow mark draws in, then "Good morning" and the
 * user's first name rise into focus (CSS, set before first paint from the
 * device clock, so no flicker), then GSAP lifts it away once the app is ready. A CSS failsafe hides it after 3.5s even if JavaScript never runs.
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
    const wait = Math.max(0, MIN_VISIBLE_MS - performance.now());
    const tl = gsap.timeline({ delay: wait / 1000, onComplete: finish });
    tl.to(el.querySelector(".lf-splash-inner"), { scale: 1.06, opacity: 0, duration: 0.35, ease: "power2.in" }).to(
      el,
      { opacity: 0, duration: 0.4, ease: MOTION.ease },
      "-=0.15",
    );
    const safety = window.setTimeout(finish, 3000);
    return () => {
      tl.kill();
      window.clearTimeout(safety);
      finish();
    };
  }, []);

  return (
    <div ref={layer} className="lf-splash-layer" aria-hidden>
      <div className="lf-splash-inner flex flex-col items-center gap-5">
        <svg viewBox="0 0 32 32" className="h-16 w-16">
          <rect width="32" height="32" rx="10" fill="rgba(255,255,255,0.1)" />
          <path
            className="lf-draw"
            pathLength={1}
            d="M8 19.5c2.6-4.6 5.2-6.9 8-6.9s4.6 2.2 8-2.6"
            stroke="white"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <path
            className="lf-draw lf-draw-2"
            pathLength={1}
            d="M8 24c2.6-3 5.2-4.5 8-4.5s4.6 1.4 8-1.7"
            stroke="white"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
            opacity=".5"
          />
        </svg>
        <div className="flex flex-col items-center text-center">
          <p className="lf-greet lf-greet-1 text-[15px] tracking-[0.18em] uppercase opacity-80" />
          <p className="lf-greet lf-greet-2 mt-2 font-display text-[40px] leading-none font-medium tracking-tight" />
          <span className="lf-greet-line mt-5 h-px w-16 bg-white/50" />
        </div>
      </div>
    </div>
  );
}
