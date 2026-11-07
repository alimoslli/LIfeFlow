"use client";
import { useEffect, useRef } from "react";
import { BrandMark } from "@/components/brand/brand-mark";
import { BankIcon, CanvasLogo, GoogleCalendarLogo, WorkIcon } from "./logos";
import "./scene.css";

/**
 * The hero phone: four slices of a week join into one picture, then a short chat shows what the assistant does with it.
 * Same bubbles, colours and tab bar as the real app. Every number is invented, so the page labels it "Example conversation".
 * Reduced motion shows the finished chat, still.
 */
const TALKS = [
  {
    me: "Can I go out Thursday night?",
    ai: "<b>Not Thursday.</b> Your shift ends at 10 and your Bio exam is Friday at 9. Wednesday after study group is open. Want me to block 8 to 10 PM for review?",
    used: [
      ["Shift · Thu 5 to 10 PM", "i"],
      ["Bio exam · Fri 9 AM", "w"],
      ["Study group · Wed 7 PM", "d"],
    ],
    acts: ["Block it", "Not now"],
    done: "Added to Wednesday. Thursday stays free.",
  },
  {
    me: "Am I okay for rent?",
    ai: "<b>Close.</b> Rent is $950 on Friday and checking is $412 before your paycheck lands. Moving $200 from savings covers it. You move it in your bank, I'll remind you.",
    used: [
      ["$412 available", ""],
      ["Rent $950 · Fri", "d"],
      ["Paycheck · next Friday", "w"],
    ],
    acts: ["Remind me", "Show details"],
    done: "Reminder set for Thursday 6 PM.",
  },
] as const;

const chips = (u: readonly (readonly [string, string])[]) => `<div class="used">${u.map((c) => `<em class="${c[1]}">${c[0]}</em>`).join("")}</div>`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function AssistantScene({ tone = "paper", caption = true }: { tone?: "paper" | "hero"; caption?: boolean }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = <T extends Element>(s: string) => el.querySelector(s) as T;
    const slicesLayer = q<HTMLElement>('[data-layer="slices"]');
    const chatLayer = q<HTMLElement>('[data-layer="chat"]');
    const title = q<HTMLElement>("[data-title]");
    const slices = q<HTMLElement>("[data-slices]");
    const chat = q<HTMLElement>("[data-chat]");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let run = 0;
    const setLayer = (n: "slices" | "chat") => {
      slicesLayer.classList.toggle("on", n === "slices");
      chatLayer.classList.toggle("on", n === "chat");
    };
    const reset = () => {
      slices.classList.remove("joined");
      slices.querySelectorAll(".slice").forEach((s) => s.classList.remove("show"));
      chat.innerHTML = "";
      title.textContent = "";
    };
    const row = (cls: string, html: string) => {
      const r = document.createElement("div");
      r.className = `row ${cls}`;
      r.innerHTML = html;
      chat.appendChild(r);
      requestAnimationFrame(() => requestAnimationFrame(() => r.classList.add("show")));
      return r;
    };

    async function talk(t: (typeof TALKS)[number], id: number) {
      const m = row("me", '<div class="bub"></div>');
      const bub = m.querySelector(".bub") as HTMLElement;
      for (let i = 1; i <= t.me.length; i++) {
        if (id !== run) return;
        bub.textContent = t.me.slice(0, i);
        await sleep(26);
      }
      await sleep(350);
      const tp = row("ai", '<div class="bub typing"><i></i><i></i><i></i></div>');
      await sleep(1300);
      if (id !== run) return;
      tp.innerHTML = `<div class="bub">${t.ai}${chips(t.used)}<div class="acts"><button type="button" tabindex="-1">${t.acts[0]}</button><button type="button" tabindex="-1">${t.acts[1]}</button></div><div class="done-note">${t.done}</div></div>`;
      await sleep(2600);
      if (id !== run) return;
      tp.querySelector(".acts button")?.classList.add("hit");
      await sleep(450);
      tp.querySelector(".done-note")?.classList.add("show");
      await sleep(2800);
    }

    async function play() {
      const id = ++run;
      if (reduce) {
        reset();
        setLayer("chat");
        const t = TALKS[0];
        row("me", `<div class="bub">${t.me}</div>`);
        row("ai", `<div class="bub">${t.ai}${chips(t.used)}<div class="done-note show">${t.done}</div></div>`);
        return;
      }
      while (id === run) {
        reset();
        setLayer("slices");
        title.textContent = "Four apps. Four slices.";
        await sleep(500);
        const all = slices.querySelectorAll(".slice");
        for (const s of all) {
          s.classList.add("show");
          await sleep(420);
        }
        await sleep(900);
        if (id !== run) return;
        title.textContent = "One picture.";
        slices.classList.add("joined");
        await sleep(2000);
        if (id !== run) return;
        setLayer("chat");
        await sleep(600);
        for (let k = 0; k < TALKS.length; k++) {
          await talk(TALKS[k], id);
          if (id !== run) return;
          if (k < TALKS.length - 1) {
            chat.innerHTML = "";
            await sleep(300);
          }
        }
        setLayer("slices");
        await sleep(700);
      }
    }

    // Pause while the tab is hidden or the phone is off screen; start when it's seen.
    let seen = false;
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      if (seen && !document.hidden) void play();
      else run++;
    });
    io.observe(el);
    const vis = () => {
      if (document.hidden) run++;
      else if (seen) void play();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      run++;
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
    };
  }, []);

  return (
    <div ref={root} className="lf-phone-scene" data-tone={tone} aria-hidden>
      <div className="phone-wrap">
        <div className="phone">
          <div className="app-top">
            <BrandMark className="h-[26px] w-[26px]" alt="" />
            <span className="name">Your assistant</span>
            <span className="dots" />
          </div>
          <div className="stage">
            <div className="layer" data-layer="slices">
              <p className="slices-title" data-title />
              <div className="slices" data-slices>
                <svg className="link-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <path d="M26 18 L72 22" />
                  <path d="M26 22 L26 58" />
                  <path d="M72 22 L74 62" />
                  <path d="M26 60 L72 64" />
                  <path d="M26 24 L72 62" />
                </svg>
                <BrandMark className="merge-mark" alt="" />
                <div className="slice s-bank">
                  <small>
                    <BankIcon className="lg" />
                    Bank
                  </small>
                  <b>$412</b>
                  <span>Rent $950 due Friday</span>
                </div>
                <div className="slice s-canvas">
                  <small>
                    <CanvasLogo className="lg" />
                    Canvas
                  </small>
                  <b>Bio exam</b>
                  <span>Friday, 9 AM</span>
                </div>
                <div className="slice s-work">
                  <small>
                    <WorkIcon className="lg" />
                    Work schedule
                  </small>
                  <b>Shift</b>
                  <span>Thursday, 5 to 10 PM</span>
                </div>
                <div className="slice s-cal">
                  <small>
                    <GoogleCalendarLogo className="lg" />
                    Google Calendar
                  </small>
                  <b>Study group</b>
                  <span>Wednesday, 7 PM</span>
                </div>
              </div>
            </div>
            <div className="layer" data-layer="chat">
              <div className="chat" data-chat />
              <div className="composer">
                <span>Message your assistant…</span>
                <i />
              </div>
            </div>
          </div>
          <div className="tabbar">
            <span>
              <i />
              Today
            </span>
            <span>
              <i />
              Plan
            </span>
            <span className="cur">
              <i />
              Assistant
            </span>
            <span>
              <i />
              Money
            </span>
            <span>
              <i />
              School
            </span>
          </div>
        </div>
        {caption && <p className="cap">Example conversation</p>}
      </div>
    </div>
  );
}
