import type { ReactNode } from "react";
import type { HqRole } from "@/server/db/schema";
import { v } from "./parts";

export type Who = HqRole | "founder";

const HAIR: Record<Who, string> = {
  developer: "hair-dev",
  designer: "hair-des",
  researcher: "hair-res",
  marketing: "hair-mkt",
  assistant: "hair-ast",
  founder: "hair-founder",
};
const TOP: Record<Who, string> = {
  developer: "hoodie",
  designer: "jacket",
  researcher: "cardigan",
  marketing: "tee",
  assistant: "blazer",
  founder: "sweater",
};

/** Local coordinates: the head's centre is (0,0), radius 22. */
function Eyes({ who, closed }: { who: Who; closed: boolean }) {
  if (closed)
    return (
      <g stroke={v("ink")} strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M-12-2q4 4 8 0" />
        <path d="M4-2q4 4 8 0" />
      </g>
    );
  if (who === "founder")
    return (
      <g className="hq-blink">
        <path d="M-13-9q5-3 10 0M3-9q5-3 10 0" stroke={v("hair-founder")} strokeWidth="2.6" strokeLinecap="round" fill="none" />
        {[-8, 8].map((x) => (
          <g key={x}>
            <circle cx={x} cy="-3" r="3.6" fill="#fff" stroke={v("ink")} strokeWidth=".6" />
            <circle cx={x} cy="-3" r="2.4" fill={v("eye-blue")} />
            <circle cx={x} cy="-3" r="1.1" fill={v("ink")} />
            <circle cx={x + 0.9} cy="-4" r=".7" fill="#fff" />
          </g>
        ))}
      </g>
    );
  return (
    <g className="hq-blink" fill={v("ink")}>
      <ellipse cx="-8" cy="-2" rx="2.6" ry="3.4" />
      <ellipse cx="8" cy="-2" rx="2.6" ry="3.4" />
      <circle cx="-7.2" cy="-3.3" r=".9" fill="#fff" />
      <circle cx="8.8" cy="-3.3" r=".9" fill="#fff" />
    </g>
  );
}

function Hair({ who, sleeping }: { who: Who; sleeping: boolean }) {
  const c = v(HAIR[who]);
  switch (who) {
    case "founder":
      return (
        // Tousled curls on top, a curly fringe falling over the forehead, short sides (the owner's look).
        <g fill={c}>
          <path d="M-22 0C-25-17-12-25 0-25S25-17 22 0C20-8 15-13 0-13S-20-8-22 0Z" />
          {[
            [-17, -18, 7],
            [-8, -24, 8],
            [3, -26, 8.5],
            [13, -22, 7.5],
            [19, -14, 6],
            [-21, -10, 5],
            [-13, -12, 5],
            [-5, -13, 5.5],
            [4, -13, 5.5],
            [12, -12, 5],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
          <path d="M-9-10q-3 4 1 6M1-10q-2 4 2 5.5M9-10q2 4-1 6" stroke={c} strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </g>
      );
    case "designer":
      return (
        <g fill={c}>
          <circle cx="0" cy="-27" r="8" />
          <path d="M-23 2C-26-16-12-24 0-24S26-16 23 2C20-4 16-9 6-12-4-6-14-6-23 2Z" />
        </g>
      );
    case "researcher":
      return (
        <g fill={c}>
          <circle cx="-17" cy="-20" r="8" />
          <path d="M-23 4C-27-16-12-25 0-25S27-16 23 4C20-6 12-11 0-9-12-11-20-6-23 4Z" />
        </g>
      );
    case "marketing":
      return (
        <g fill={c}>
          <path d="M-22 2C-26-12-14-22 0-22S26-12 22 2L24 16 20 16 20 2Z" />
          {!sleeping && <circle cx="24" cy="6" r="6" />}
          {sleeping && <path d="M-23 4C-27-16-12-24 0-24S27-16 23 4C18-6 10-10 0-10S-18-6-23 4Z" />}
        </g>
      );
    case "assistant":
      return (
        <g fill={c}>
          <path d="M-24 14C-28-14-12-25 0-25S28-14 24 14L18 14C18 0 14-8 0-10-14-8-18 0-18 14Z" />
        </g>
      );
    default:
      return (
        <g fill={c}>
          <path d="M-23 4C-27-18-10-26 0-26S27-18 23 4C20-6 10-11 0-10-10-11-20-6-23 4Z" />
        </g>
      );
  }
}

function Accessories({ who }: { who: Who }) {
  switch (who) {
    case "developer":
      return (
        <g>
          <path d="M-24-4C-24-34 24-34 24-4" stroke={v("phones")} strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <rect x="-30" y="-10" width="10" height="20" rx="5" fill={v("phones")} />
          <rect x="20" y="-10" width="10" height="20" rx="5" fill={v("phones")} />
          <rect x="-28" y="-6" width="5" height="12" rx="2.5" fill={v("phones-in")} />
          <rect x="23" y="-6" width="5" height="12" rx="2.5" fill={v("phones-in")} />
        </g>
      );
    case "researcher":
      return (
        <g stroke={v("ink")} strokeWidth="1.6" fill="#fff" fillOpacity=".18">
          <circle cx="-8" cy="-2" r="7.4" />
          <circle cx="8" cy="-2" r="7.4" />
          <path d="M-0.6-2h1.2M-15.4-3-22-5M15.4-3 22-5" fill="none" />
        </g>
      );
    case "marketing":
      return (
        <g>
          <path d="M-23-6C-23-26 23-26 23-6Z" fill={v("cap")} />
          <path d="M-4-8H34c0 5-6 7-14 7H-4Z" fill={v("cap-d")} />
          <circle cx="0" cy="-23" r="2.2" fill={v("cap-d")} />
        </g>
      );
    case "assistant":
      return (
        <g>
          <path d="M-24-4C-24-30 24-30 24-4" stroke={v("phones")} strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <rect x="-28" y="-8" width="8" height="15" rx="4" fill={v("phones")} />
          <path d="M-24 7Q-20 22-6 16" stroke={v("phones")} strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="-5" cy="16" r="2.4" fill={v("phones-in")} />
        </g>
      );
    case "founder":
      return (
        // Black sunglasses pulled down the nose (eyes show above), tiny silver details at the hinges.
        <g>
          <path d="M-2.5 6.2Q0 4.6 2.5 6.2" stroke={v("shades")} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <rect x="-16.5" y="4.2" width="14" height="6.6" rx="2.2" fill={v("shades")} />
          <rect x="2.5" y="4.2" width="14" height="6.6" rx="2.2" fill={v("shades")} />
          <path d="M-14.3 5.9h5.5M4.8 5.9h5.5" stroke="#fff" strokeWidth=".9" strokeLinecap="round" opacity=".3" />
          <path d="M-16.5 5.4L-21 3.6M16.5 5.4L21 3.6" stroke={v("shades")} strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="-16.6" cy="5.3" r="1.1" fill="#d7dbe0" />
          <circle cx="16.6" cy="5.3" r="1.1" fill="#d7dbe0" />
        </g>
      );
    default:
      return null;
  }
}

/** The head: face, hair and the job's accessory. Sleeping heads close their eyes and drop the accessories. */
export function Head({ who, sleeping = false }: { who: Who; sleeping?: boolean }) {
  return (
    <g>
      <circle cx="-22" cy="2" r="4.5" fill={v("skin-d")} />
      <circle cx="22" cy="2" r="4.5" fill={v("skin-d")} />
      <circle r="22" fill={v("skin")} />
      <Hair who={who} sleeping={sleeping} />
      <Eyes who={who} closed={sleeping} />
      <circle cx={who === "founder" ? -15 : -13} cy={who === "founder" ? 12 : 8} r="3.4" fill={v("blush")} opacity=".55" />
      <circle cx={who === "founder" ? 15 : 13} cy={who === "founder" ? 12 : 8} r="3.4" fill={v("blush")} opacity=".55" />
      <path
        d={sleeping ? "M-3 12q3 2 6 0" : who === "founder" ? "M-3.5 15.2q3.5 2.6 7 0" : "M-4 11q4 4 8 0"}
        stroke={v("ink")}
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {!sleeping && <Accessories who={who} />}
    </g>
  );
}

/** Shoulders and torso (sitting). The desk covers everything below its top edge. */
function Torso({ who }: { who: Who }) {
  const c = v(TOP[who]);
  return (
    <g>
      <path d="M-25 70L-24 28Q-23 17-12 16H12Q23 17 24 28L25 70Z" fill={c} />
      <path d="M-25 70L-24 28Q-23 17-12 16H-9Q-12 30-12 70Z" fill="#000" opacity=".08" />
      {who === "developer" && (
        <g>
          <ellipse cx="0" cy="19" rx="13" ry="5.5" fill={v("hoodie-d")} />
          <path d="M-4 22v14M4 22v14" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" opacity=".7" />
        </g>
      )}
      {who === "designer" && <path d="M-9 17L0 30 9 17" fill={v("skin")} stroke={v("jacket-d")} strokeWidth="2" strokeLinejoin="round" />}
      {who === "researcher" && (
        <g>
          <path d="M-9 17L0 32 9 17" fill="#fff" stroke={v("cardigan-d")} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="0" cy="42" r="1.6" fill={v("cardigan-d")} />
          <circle cx="0" cy="52" r="1.6" fill={v("cardigan-d")} />
        </g>
      )}
      {who === "marketing" && <path d="M-10 17Q0 25 10 17" fill="none" stroke={v("cap")} strokeWidth="2.4" strokeLinecap="round" />}
      {who === "assistant" && (
        <g>
          <path d="M-9 17L0 34 9 17" fill="#fff" />
          <path d="M-9 17L0 34-6 40-15 24ZM9 17L0 34 6 40 15 24Z" fill={v("blazer-d")} />
        </g>
      )}
      {who === "founder" && (
        <g>
          <path d="M-8 16L0 27 8 16Z" fill="#fff" />
          <path d="M-13 16Q0 29 13 16V22Q0 33-13 22Z" fill={v("sweater-d")} />
          <path d="M0 27V62" stroke="#c9ced4" strokeWidth="1.8" strokeLinecap="round" />
          <rect x="-1.6" y="27" width="3.2" height="7" rx="1.2" fill="#e8ebee" />
          <path d="M-8 17L0 27 8 17" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </g>
      )}
    </g>
  );
}

function Arms({ who }: { who: Who }) {
  const c = v(TOP[who]);
  return (
    <g stroke={c} strokeWidth="10" strokeLinecap="round" fill="none">
      <path d="M-21 28Q-31 42-17 48" />
      <path d="M21 28Q31 42 17 48" />
    </g>
  );
}

/** A character sitting at their desk. The head is at (x, y); hands are rendered separately so they can sit on the desk. */
export function SeatedBody({ who, x, y, children }: { who: Who; x: number; y: number; children?: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Arms who={who} />
      <Torso who={who} />
      <Head who={who} />
      {children}
    </g>
  );
}

/** Hands on the desk top. They bob while the person is working. */
export function Hands({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle className="hq-hand hq-hand-l" cx="-17" cy="0" r="5.2" fill={v("skin")} />
      <circle className="hq-hand hq-hand-r" cx="17" cy="0" r="5.2" fill={v("skin")} />
    </g>
  );
}

/** A character asleep with their head on the pillow. */
export function SleepingHead({ who, x, y }: { who: Who; x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(-8)`}>
      <Head who={who} sleeping />
    </g>
  );
}
