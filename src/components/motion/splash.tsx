"use client";
import { useEffect, useRef } from "react";
import { gsap, MOTION } from "./gsap";
import { markHydrated, setSplashActive } from "./intro";
import { SplashScene } from "./splash-scene";

const SESSION_KEY = "lf_splash_shown";
/** The signed-in user's first name, remembered on this device for the greeting. */
export const NAME_KEY = "lf_first_name";
/** The user's time zone (Settings), remembered on this device so the greeting follows it, not the device clock. */
export const TZ_KEY = "lf_tz";

/**
 * Runs before first paint (inline in <body>): shows the splash once per
 * session, never with reduced motion, and not under automation (tests)
 * unless forced with ?splash=1. Uses a class on <html> so there's no flash.
 * The greeting uses the hour in the user's time zone (TZ_KEY), or the device
 * clock until the app has saved it on this device. The skyling of the moment
 * follows the sun in that zone like Today does (SKY_MOMENT); before a zone is
 * saved it goes by the hour.
 */
/**
 * Whose moment it is in a time zone, the same way Today decides (lib/day-clock sunTimes + lib/companions skylingAt: the
 * sun's rise and set for the zone's meridian at 38°N), so the opening screen and Today show the same skyling. Plain
 * ES5 for the inline script; `tests/unit/splash-greeting.test.ts` checks it against the library for many times and zones.
 */
const SKY_MOMENT = `function(z,t){var F=new Intl.DateTimeFormat("en-US",{timeZone:z,hourCycle:"h23",year:"numeric",month:"numeric",day:"numeric",hour:"numeric",minute:"numeric"});function P(u){var o={};F.formatToParts(u).forEach(function(x){o[x.type]=+x.value});return o}function O(u){var p=P(u);return(Date.UTC(p.year,p.month-1,p.day,p.hour%24,p.minute)-u)/6e4}var p=P(t),y=p.year,m=p.month,d=p.day,now=(p.hour%24)*60+p.minute,std=Math.min(O(Date.UTC(y,0,15,12)),O(Date.UTC(y,6,15,12))),n=Math.round((Date.UTC(y,m-1,d)-Date.UTC(y,0,0))/864e5),b=2*Math.PI*(n-81)/364,noon=720-(9.87*Math.sin(2*b)-7.53*Math.cos(b)-1.5*Math.sin(b))+(O(Date.UTC(y,m-1,d,12))-std),k=Math.PI/180,de=23.44*Math.sin(2*Math.PI*(284+n)/365)*k,la=38*k,c=(Math.sin(-.833*k)-Math.sin(la)*Math.sin(de))/(Math.cos(la)*Math.cos(de)),hf=Math.acos(Math.max(-1,Math.min(1,c)))/k*4,ri=Math.round(noon-hf),se=Math.round(noon+hf),mid=(ri+se)/2;return now>=ri-70&&now<ri+45?"dawn":now>=ri+45&&now<mid-60?"ray":now>=mid-60&&now<se-90?"noon":now>=se-90&&now<se+5?"goldie":now>=se+5&&now<se+70?"dusk":"star"}`;

export const SPLASH_SCRIPT = `try{var q=location.search,s=sessionStorage;if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&(/[?&]splash=1/.test(q)||(!s.getItem("${SESSION_KEY}")&&!navigator.webdriver&&!/[?&]nosplash/.test(q)))){var r=document.documentElement,h=new Date().getHours(),n="";try{n=(localStorage.getItem("${NAME_KEY}")||"").slice(0,24)}catch(e){}try{var z=localStorage.getItem("${TZ_KEY}");if(z)h=+new Intl.DateTimeFormat("en-US",{hour:"numeric",hourCycle:"h23",timeZone:z}).format(new Date())%24}catch(e){}r.style.setProperty("--lf-greet",JSON.stringify(h<5?"Up late":h<12?"Good morning":h<17?"Good afternoon":"Good evening"));r.style.setProperty("--lf-name",JSON.stringify(n||"Welcome back"));var mo="";try{if(z)mo=(${SKY_MOMENT})(z,new Date().getTime())}catch(e){}r.setAttribute("data-lf-moment",mo||(h<5||h>=21?"star":h<7?"dawn":h<11?"ray":h<16?"noon":h<19?"goldie":"dusk"));r.classList.add("lf-splash");s.setItem("${SESSION_KEY}","1")}}catch(e){}`;

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
 * Opening screen: the morning. The LifeFlow sun (the owner's pixel logo, face and all) rises
 * out of the water in CSS and its rays pop in (globals.css, .lf-splash-*), then "Good morning"
 * and the user's first name rise into focus (CSS, set before first paint from the
 * hour in the user's time zone, so no flicker). It stays until the app has really loaded (the
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
      <div className="lf-splash-inner">
        <SplashScene />
        <div className="lf-splash-ground text-center">
          <p className="lf-greet lf-greet-1 text-[0.9375rem] tracking-[0.18em] uppercase opacity-80" />
          <p className="lf-greet lf-greet-2 mt-2 font-display text-[2.5rem] leading-none font-medium tracking-tight" />
          <span className="lf-greet-line mt-5 h-px w-16 bg-white/50" />
        </div>
      </div>
    </div>
  );
}
