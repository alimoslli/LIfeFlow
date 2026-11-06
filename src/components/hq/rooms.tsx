import type { HqRole } from "@/server/db/schema";
import type { EmployeeState } from "@/server/hq/state";
import { Bed, Desk, Glow, Shell, Window, v } from "./parts";
import { Hands, SeatedBody, SleepingHead } from "./people";

/* ---- Wall pieces and job props, one set per employee ------------------------------------------------------------- */

function DevProps({ working, off }: { working: boolean; off: boolean }) {
  const lines = [
    [0, 26, "screen-a"],
    [6, 16, "screen-b"],
    [6, 30, "screen-a"],
    [12, 12, "screen-c"],
    [6, 22, "screen-b"],
    [0, 28, "screen-a"],
    [6, 14, "screen-c"],
    [12, 24, "screen-b"],
    [6, 18, "screen-a"],
    [0, 26, "screen-c"],
  ] as const;
  return (
    <g>
      {/* wall: shelf with a plant and books */}
      <rect x="168" y="52" width="62" height="5" rx="2" fill={v("wood-l")} />
      <use href="#hq-books" transform="translate(172 52)" />
      <use href="#hq-plant" transform="translate(214 52) scale(.8)" />
      <rect x="244" y="22" width="52" height="30" rx="3" fill={v("paper")} opacity=".9" />
      <path d="M252 32h18M252 38h30M252 44h22" stroke={v("wood")} strokeWidth="2.2" strokeLinecap="round" />
      {/* monitor */}
      <rect x="264" y="92" width="52" height="40" rx="4" fill={v("wood-d")} />
      <rect x="267" y="95" width="46" height="34" rx="2" fill={off ? v("screen-off") : v("screen")} />
      <clipPath id="hq-dev-clip">
        <rect x="267" y="95" width="46" height="34" />
      </clipPath>
      {!off && (
        <g clipPath="url(#hq-dev-clip)">
          <g className={working ? "hq-scroll" : undefined}>
            {[...lines, ...lines].map(([ind, len, c], i) => (
              <rect key={i} x={270 + ind} y={98 + i * 5} width={len} height="2.4" rx="1.2" fill={v(c)} opacity=".9" />
            ))}
          </g>
        </g>
      )}
      <rect x="284" y="132" width="12" height="16" fill={v("wood-d")} />
      {/* laptop in front, back of the lid with the leaf */}
      <rect x="196" y="126" width="52" height="24" rx="4" fill={v("laptop")} />
      <use href="#hq-leaf" transform="translate(215 130) scale(.5)" opacity=".9" />
    </g>
  );
}

function DesignerProps({ working, off }: { working: boolean; off: boolean }) {
  const sw = ["#e0795a", "#f0b95c", "#7db58f", "#6f9bd1", "#b78ac2"];
  return (
    <g>
      {sw.map((c, i) => (
        <rect key={c} x={160 + i * 13} y={24 + (i % 2) * 4} width="11" height="20" rx="2" fill={c} />
      ))}
      <path d="M232 52h68" stroke={v("ink")} strokeWidth="1.6" opacity=".55" />
      {[236, 252, 268, 284, 298].map((x, i) => (
        <circle key={x} cx={x} cy={i % 2 ? 46 : 52} r="3.4" fill={v("jacket")} />
      ))}
      <path d="M236 52L252 46 268 52 284 46 298 52" stroke={v("jacket")} strokeWidth="1.4" fill="none" opacity=".6" />
      {/* tablet */}
      <rect x="262" y="104" width="46" height="42" rx="5" fill={v("laptop")} transform="rotate(-6 285 125)" />
      <rect x="266" y="108" width="38" height="34" rx="3" fill={off ? v("screen-off") : v("paper")} transform="rotate(-6 285 125)" />
      {!off && (
        <g transform="rotate(-6 285 125)">
          <path d="M270 134Q278 112 286 126T300 116" stroke={v("jacket")} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <circle cx="272" cy="114" r="2.4" fill="#7db58f" />
          <circle cx="279" cy="114" r="2.4" fill="#f0b95c" />
        </g>
      )}
      <g className={working ? "hq-stylus" : undefined}>
        <path d="M262 140l22-14" stroke={v("wood-d")} strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="285" cy="125.5" r="1.4" fill={v("jacket")} />
      </g>
    </g>
  );
}

function ResearcherProps({ working }: { working: boolean }) {
  const spines = ["#d4795a", "#e3b85c", "#5f9f82", "#6f9bd1", "#b78ac2", "#c9d2a0", "#d4795a", "#7a8cc4", "#e3b85c", "#5f9f82"];
  return (
    <g>
      <rect x="158" y="18" width="150" height="50" rx="3" fill={v("wood-d")} />
      <rect x="161" y="21" width="144" height="21" fill={v("wall-2")} />
      <rect x="161" y="45" width="144" height="20" fill={v("wall-2")} />
      {spines.map((c, i) => (
        <rect key={i} x={164 + i * 14} y={26 + (i % 3)} width="10" height={16 - (i % 3)} rx="1.5" fill={c} />
      ))}
      {spines.map((c, i) => (
        <rect key={`b${i}`} x={164 + i * 14} y={49 + ((i * 2) % 3)} width="10" height={16 - ((i * 2) % 3)} rx="1.5" fill={spines[(i + 4) % 10]} />
      ))}
      {/* books and globe on the desk */}
      <use href="#hq-books" transform="translate(264 148)" />
      <g>
        <rect x="294" y="140" width="4" height="8" fill={v("wood-d")} />
        <circle cx="296" cy="130" r="11" fill="#6f9bd1" />
        <path d="M288 128q6-6 10 0t5 4M290 136q5 2 9-1" stroke="#7db58f" strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M287 121a12 12 0 0 1 18 2" stroke={v("brass")} strokeWidth="1.6" fill="none" />
      </g>
      {/* magnifier */}
      <g className={working ? "hq-mag" : undefined}>
        <circle cx="262" cy="118" r="10" fill="#fff" fillOpacity=".35" stroke={v("brass")} strokeWidth="3" />
        <path d="M255 125l-12 14" stroke={v("wood-d")} strokeWidth="4" strokeLinecap="round" />
      </g>
    </g>
  );
}

function MarketingProps({ working, off }: { working: boolean; off: boolean }) {
  return (
    <g>
      {/* storyboard */}
      <rect x="160" y="20" width="96" height="42" rx="3" fill={v("paper")} opacity=".92" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x={165 + i * 30} y="26" width="26" height="18" rx="2" fill="none" stroke={v("ink")} strokeWidth="1.2" opacity=".6" />
          <circle cx={178 + i * 30} cy="35" r="4" fill={["#e0795a", "#7db58f", "#6f9bd1"][i]} />
          <path d={`M${166 + i * 30} 50h24`} stroke={v("wood")} strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      {/* ring light on a tripod */}
      <path d="M290 150l-12 4M290 150l12 4M290 150v-34" stroke={v("laptop")} strokeWidth="3" strokeLinecap="round" />
      <g className={working ? "hq-ring" : undefined}>
        <circle cx="290" cy="94" r="23" fill="none" stroke={off ? v("screen-off") : "#fff8e0"} strokeWidth="7" />
        {!off && <circle cx="290" cy="94" r="29" fill="none" stroke={v("lamp")} strokeWidth="3" opacity=".55" />}
      </g>
      <rect x="283" y="84" width="14" height="22" rx="3" fill={v("laptop")} />
      <rect x="285" y="87" width="10" height="14" rx="1.5" fill={off ? v("screen-off") : "#8fc7e8"} />
    </g>
  );
}

function QaProps({ working, off }: { working: boolean; off: boolean }) {
  return (
    <g>
      {/* checklist board on the wall */}
      <rect x="150" y="16" width="92" height="58" rx="4" fill={v("wood-d")} />
      <rect x="154" y="20" width="84" height="50" rx="2" fill={v("paper")} />
      <rect x="178" y="12" width="36" height="8" rx="3" fill={v("brass")} />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="160" y={27 + i * 14} width="9" height="9" rx="2" fill="none" stroke={v("polo-d")} strokeWidth="1.4" />
          <path d={`M174 ${31.5 + i * 14}h54`} stroke={v("wood")} strokeWidth="2.4" strokeLinecap="round" />
          <path
            className={`hq-tick hq-tick-${i + 1}`}
            d={`M161.5 ${31.5 + i * 14}l2.8 3 5-6.4`}
            stroke={v("tick")}
            strokeWidth="2.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={working ? undefined : i < 2 ? 1 : 0}
          />
        </g>
      ))}
      {/* small screen with ticks */}
      <rect x="262" y="96" width="52" height="40" rx="4" fill={v("wood-d")} />
      <rect x="265" y="99" width="46" height="34" rx="2" fill={off ? v("screen-off") : v("screen")} />
      {!off &&
        [0, 1, 2].map((i) => (
          <g key={i}>
            <path d={`M269 ${108 + i * 9}l2.4 2.6 4.4-5.4`} stroke="#8fe3b8" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="280" y={105 + i * 9} width={24 - i * 5} height="2.6" rx="1.3" fill={v(["screen-a", "screen-c", "screen-b"][i])} opacity=".9" />
          </g>
        ))}
      <rect x="282" y="136" width="12" height="12" fill={v("wood-d")} />
    </g>
  );
}

function SupportProps({ working, off }: { working: boolean; off: boolean }) {
  return (
    <g>
      {/* chat bubbles on the wall */}
      <rect x="150" y="18" width="150" height="48" rx="4" fill={v("paper")} opacity=".92" />
      <g>
        <rect x="158" y="24" width="52" height="16" rx="8" fill={v("knit")} opacity=".9" />
        <path d="M166 40l-3 6 9-6z" fill={v("knit")} opacity=".9" />
        <path d="M168 32h30" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="222" y="34" width="68" height="16" rx="8" fill={v("sky-a")} />
        <path d="M280 50l4 6-10-6z" fill={v("sky-a")} />
        <path d="M232 42h12M250 42h8" stroke={v("ink")} strokeWidth="2.4" strokeLinecap="round" opacity=".6" />
        <path d="M278 38.6c-1.2-2 -4.4-.8-3.2 1.6l3.2 3 3.2-3c1.2-2.4-2-3.6-3.2-1.6z" fill={v("heart")} />
      </g>
      {/* laptop, back of the lid with a bubble */}
      <rect x="262" y="118" width="54" height="30" rx="4" fill={v("laptop")} />
      <path d="M281 126h16a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-9l-4 4v-4h-3a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" fill={off ? v("screen-off") : "#fff"} opacity=".9" />
      {/* a message pops above the laptop while typing */}
      {working && (
        <g className="hq-popbubble">
          <rect x="274" y="92" width="34" height="18" rx="9" fill={v("paper")} stroke={v("knit-d")} strokeWidth="1.4" />
          <circle cx="284" cy="101" r="2" fill={v("knit-d")} />
          <circle cx="291" cy="101" r="2" fill={v("knit-d")} />
          <circle cx="298" cy="101" r="2" fill={v("knit-d")} />
        </g>
      )}
      {/* heart mug */}
      <g transform="translate(246 148)">
        <rect x="-8" y="-17" width="16" height="17" rx="4" fill={v("paper")} stroke={v("wood")} strokeWidth="1" />
        <path d="M8-13c6 0 6 8 0 8" stroke={v("paper")} strokeWidth="2.6" fill="none" />
        <path d="M0-4.4c-5-3.4-5.4-7.4-2.6-8.2 1.4-.4 2.6.6 2.6 1.8 0-1.2 1.2-2.2 2.6-1.8 2.8.8 2.4 4.8-2.6 8.2z" fill={v("heart")} />
      </g>
    </g>
  );
}

function Props({ role, working, off }: { role: HqRole; working: boolean; off: boolean }) {
  switch (role) {
    case "developer":
      return <DevProps working={working} off={off} />;
    case "designer":
      return <DesignerProps working={working} off={off} />;
    case "researcher":
      return <ResearcherProps working={working} />;
    case "marketing":
      return <MarketingProps working={working} off={off} />;
    case "qa":
      return <QaProps working={working} off={off} />;
    case "support":
      return <SupportProps working={working} off={off} />;
    default:
      return null;
  }
}

/* ---- Overlays ---------------------------------------------------------------------------------------------------- */

function Overlay({ state, x, y }: { state: EmployeeState; x: number; y: number }) {
  if (state === "needs_you")
    return (
      <g transform={`translate(${x} ${y})`}>
        <g className="hq-bounce">
          <rect x="-13" y="-15" width="26" height="26" rx="10" fill={v("paper")} stroke={v("accent")} strokeWidth="2" />
          <path d="M-4 9l4 6 4-6z" fill={v("paper")} stroke={v("accent")} strokeWidth="2" strokeLinejoin="round" />
          <rect x="-6" y="7" width="12" height="4" fill={v("paper")} />
          <text x="0" y="5" textAnchor="middle" fontSize="18" fontWeight="800" fill={v("accent")} fontFamily="system-ui,sans-serif">
            !
          </text>
        </g>
      </g>
    );
  if (state === "done")
    return (
      <g transform={`translate(${x} ${y})`}>
        <circle r="13" fill="#4fae7b" />
        <path d="M-6 0l4.5 5 8-9.5" stroke="#fff" strokeWidth="3.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <g className="hq-sparkle" fill="#ffd978">
          <path d="M16-14l2.4 5 5 2.4-5 2.4-2.4 5-2.4-5-5-2.4 5-2.4z" />
        </g>
        <g className="hq-sparkle hq-sparkle-2" fill="#ffd978">
          <path d="M-18-12l1.6 3.4 3.4 1.6-3.4 1.6-1.6 3.4-1.6-3.4-3.4-1.6 3.4-1.6z" />
        </g>
      </g>
    );
  if (state === "blocked")
    return (
      <g transform={`translate(${x} ${y})`}>
        <path d="M0-15L15 11H-15Z" fill="#f0b23c" stroke="#9a5806" strokeWidth="2" strokeLinejoin="round" />
        <path d="M0-6v9" stroke="#5a3303" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="0" cy="7" r="1.6" fill="#5a3303" />
      </g>
    );
  return null;
}

function Zzz({ x, y }: { x: number; y: number }) {
  return (
    <g fontFamily="system-ui,sans-serif" fontWeight="800" fill={v("zzz")}>
      <text className="hq-z hq-z1" x={x} y={y} fontSize="13">
        z
      </text>
      <text className="hq-z hq-z2" x={x + 10} y={y - 12} fontSize="17">
        Z
      </text>
      <text className="hq-z hq-z3" x={x + 22} y={y - 26} fontSize="21">
        z
      </text>
    </g>
  );
}

function Plug({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={v("muted")} strokeWidth="3" strokeLinecap="round" fill="none">
      <path d="M-6-14v-8M6-14v-8" />
      <rect x="-11" y="-14" width="22" height="16" rx="5" fill={v("wall-2")} />
      <path d="M0 2q0 12 14 12" />
    </g>
  );
}

/* ---- Rooms ------------------------------------------------------------------------------------------------------- */

/** An employee's room: a desk area and a bed, with the person at one of them. 320 x 220. */
export function EmployeeRoomArt({ role, state }: { role: HqRole; state: EmployeeState }) {
  if (role === "assistant") return <ChiefRoomArt state={state} />;
  const off = state === "offline";
  const sleeping = state === "sleeping";
  const seated = !off && !sleeping;
  const working = state === "working";
  return (
    <svg viewBox="0 0 320 220" role="presentation" aria-hidden="true" focusable="false" className="hq-art" preserveAspectRatio="xMidYMid slice">
      <Shell>
        <Window x={18} y={24} w={58} h={54} />
        <rect x="88" y="62" width="40" height="5" rx="2" fill={v("wood-l")} />
        <use href="#hq-plant" transform="translate(108 62) scale(.7)" />
      </Shell>
      <ellipse cx="232" cy="206" rx="78" ry="9" fill={v("rug")} opacity=".7" />
      <Bed />
      <ellipse cx="36" cy="143" rx="25" ry="10" fill={v("pillow")} />
      {sleeping && <SleepingHead who={role} x={38} y={132} />}
      {/* blanket on the bed, breathing while someone sleeps */}
      <g className={sleeping ? "hq-breathe" : undefined}>
        <rect x="56" y="136" width="70" height="30" rx="12" fill={v("blanket")} />
        <rect x="56" y="136" width="70" height="8" rx="4" fill="#fff" opacity=".16" />
        <use href="#hq-leaf" transform="translate(80 146) scale(.5)" opacity=".7" />
      </g>
      <Props role={role} working={working} off={off || sleeping} />
      <rect x="196" y="118" width="60" height="42" rx="14" fill={v("wood-d")} opacity=".95" />
      {seated && <SeatedBody who={role} x={222} y={100} />}
      <Desk x={150} w={164} />
      {seated && <Hands x={222} y={146} />}
      <use href="#hq-lamp" transform="translate(166 148)" />
      <use href="#hq-mug" transform="translate(192 148)" />
      <use href="#hq-plant" transform="translate(140 198) scale(1.15)" />
      {!off && <Glow x={181} y={116} r={sleeping ? 40 : 70} className={sleeping ? "hq-glow-dim" : ""} />}
      {off && <Plug x={232} y={178} />}
      {sleeping && <Zzz x={70} y={114} />}
      {seated && <Overlay state={state} x={258} y={64} />}
    </svg>
  );
}

const DEPT_DOTS = ["#4d9a6a", "#e5b23f", "#e08a5b", "#6f9bd1", "#b78ac2", "#e0546f"] as const;

/** The Chief of Staff's wide room: a team board with six department dots, a tablet, the desk facing the room. 480 x 200. */
export function ChiefRoomArt({ state }: { state: EmployeeState }) {
  const off = state === "offline";
  const sleeping = state === "sleeping";
  const seated = !off && !sleeping;
  return (
    <svg viewBox="0 0 480 200" role="presentation" aria-hidden="true" focusable="false" className="hq-art" preserveAspectRatio="xMidYMid slice">
      <Shell w={480} h={200} floorY={150}>
        <Window x={18} y={24} w={58} h={54} />
        <rect x="88" y="62" width="40" height="5" rx="2" fill={v("wood-l")} />
        <use href="#hq-plant" transform="translate(108 62) scale(.7)" />
        {/* clipboard */}
        <rect x="160" y="22" width="34" height="42" rx="4" fill={v("wood-l")} />
        <rect x="164" y="28" width="26" height="32" rx="2" fill={v("paper")} />
        <rect x="170" y="19" width="14" height="7" rx="2" fill={v("brass")} />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M168 ${36 + i * 8}h18`} stroke={v("wood")} strokeWidth="2" strokeLinecap="round" />
        ))}
        {/* team board: the Chief of Staff in the middle, six department dots */}
        <rect x="236" y="14" width="150" height="56" rx="4" fill={v("wood-d")} />
        <rect x="240" y="18" width="142" height="48" rx="2" fill={v("paper")} />
        <circle cx="311" cy="28" r="7" fill={v("blazer")} />
        <path d="M308 28l2.2 2.4 3.8-4.6" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <path
          d="M311 35v6M258 41H364M258 41v6M276 41v6M294 41v6M328 41v6M346 41v6M364 41v6"
          stroke={v("ink")}
          strokeWidth="1.2"
          opacity=".5"
          strokeLinecap="round"
        />
        {DEPT_DOTS.map((c, i) => (
          <circle key={c} cx={[258, 276, 294, 328, 346, 364][i]} cy="52" r="5.4" fill={c} />
        ))}
      </Shell>
      <ellipse cx="350" cy="190" rx="110" ry="9" fill={v("rug")} opacity=".7" />
      <Bed />
      <ellipse cx="36" cy="143" rx="25" ry="10" fill={v("pillow")} />
      {sleeping && <SleepingHead who="assistant" x={38} y={132} />}
      <g className={sleeping ? "hq-breathe" : undefined}>
        <rect x="56" y="136" width="70" height="30" rx="12" fill={v("blanket")} />
        <rect x="56" y="136" width="70" height="8" rx="4" fill="#fff" opacity=".16" />
        <use href="#hq-leaf" transform="translate(80 146) scale(.5)" opacity=".7" />
      </g>
      <rect x="318" y="100" width="64" height="52" rx="16" fill={v("wood-d")} opacity=".95" />
      {seated && <SeatedBody who="assistant" x={350} y={102} />}
      {/* the tablet in hand, upright in front of the jacket */}
      <g transform="rotate(-6 350 132)">
        <rect x="334" y="116" width="36" height="30" rx="4" fill={v("laptop")} />
        <rect x="337" y="119" width="30" height="24" rx="2" fill={off || sleeping ? v("screen-off") : v("screen")} />
        {seated && (
          <g>
            {[0, 1, 2].map((i) => (
              <rect key={i} x="341" y={123 + i * 6} width={[16, 22, 12][i]} height="2.6" rx="1.3" fill={v(["screen-a", "screen-b", "screen-c"][i])} />
            ))}
            <circle className="hq-tap" cx="359" cy="130" r="3" fill="#fff" opacity=".85" />
            <circle className="hq-tap hq-tap-2" cx="352" cy="138" r="3" fill="#fff" opacity=".85" />
          </g>
        )}
      </g>
      <Desk x={256} w={200} />
      {seated && <Hands x={350} y={146} />}
      <use href="#hq-lamp" transform="translate(282 148)" />
      <use href="#hq-mug" transform="translate(316 148)" />
      <use href="#hq-books" transform="translate(402 148)" />
      <use href="#hq-plant" transform="translate(218 198) scale(1.15)" />
      {!off && <Glow x={298} y={116} r={sleeping ? 40 : 70} className={sleeping ? "hq-glow-dim" : ""} />}
      {off && <Plug x={350} y={180} />}
      {sleeping && <Zzz x={70} y={114} />}
      {seated && <Overlay state={state} x={420} y={72} />}
    </svg>
  );
}

/** The founder's corner office. 480 x 190. */
export function FounderRoomArt({ pending }: { pending: number }) {
  const cards = Math.min(pending, 5);
  return (
    <svg viewBox="0 0 480 190" role="presentation" aria-hidden="true" focusable="false" className="hq-art hq-art-wide" preserveAspectRatio="xMidYMax meet">
      <Shell w={480} h={190} floorY={140}>
        <Window x={22} y={20} w={128} h={86} />
        <rect x="174" y="22" width="58" height="40" rx="3" fill={v("paper")} opacity=".9" />
        <use href="#hq-leaf" transform="translate(190 28) scale(.9)" />
        <rect x="244" y="20" width="62" height="28" rx="3" fill={v("wood-d")} />
        <path d="M252 30h30M252 38h42" stroke={v("paper")} strokeWidth="2.2" strokeLinecap="round" opacity=".8" />
        {/* door with the brass plate */}
        <rect x="414" y="26" width="52" height="116" rx="4" fill={v("wood-d")} />
        <rect x="420" y="32" width="40" height="46" rx="3" fill={v("wood")} />
        <rect x="420" y="84" width="40" height="52" rx="3" fill={v("wood")} />
        <circle cx="428" cy="92" r="2.8" fill={v("brass")} />
        <rect x="428" y="44" width="24" height="9" rx="2" fill={v("brass")} />
        <path d="M431 48.5h18" stroke={v("wood-d")} strokeWidth="1.2" strokeLinecap="round" />
      </Shell>
      <ellipse cx="300" cy="176" rx="130" ry="9" fill={v("rug")} opacity=".7" />
      {/* tall leather executive chair */}
      <rect x="250" y="54" width="76" height="98" rx="20" fill={v("leather")} />
      <rect x="258" y="62" width="60" height="84" rx="15" fill={v("leather-l")} />
      <path d="M272 70v66M288 68v70M304 70v66" stroke={v("leather")} strokeWidth="1.4" opacity=".6" />
      <SeatedBody who="founder" x={288} y={92} />
      <Desk x={184} w={210} y={138} />
      <Hands x={288} y={136} />
      {/* a gold watch on the left wrist */}
      <g transform="translate(266 131) rotate(-35)">
        <rect x="-1.6" y="-4.6" width="3.2" height="9.2" rx="1" fill="#a8863a" />
        <circle r="2.7" fill="#e2c06a" />
        <circle r="1.8" fill="#16202c" />
        <path d="M0-1.2V0l.8.6" stroke="#e2c06a" strokeWidth=".45" strokeLinecap="round" fill="none" />
      </g>
      <use href="#hq-lamp" transform="translate(206 138)" />
      <use href="#hq-mug" transform="translate(238 138)" />
      {/* a phone lying on the desk (no laptop in front, so the outfit shows) */}
      <rect x="316" y="133.5" width="18" height="4.5" rx="1.4" fill={v("laptop")} />
      <rect x="318" y="134.4" width="14" height="1.6" rx=".8" fill={v("accent")} opacity=".7" />
      <use href="#hq-plant" transform="translate(168 188) scale(1.3)" />
      <use href="#hq-plant" transform="translate(402 188) scale(1.1)" />
      <Glow x={226} y={104} r={80} />
      {/* approvals waiting: a small stack of cards, only when there are some */}
      {cards > 0 && (
        <g>
          {Array.from({ length: cards }, (_, i) => (
            <g key={i}>
              <rect x={346 + (i % 2)} y={134 - i * 4.5} width="34" height="6" rx="1.5" fill={v("paper")} stroke={v("wood")} strokeWidth=".8" />
              <rect x={349 + (i % 2)} y={135.5 - i * 4.5} width="14" height="1.6" rx=".8" fill={v("accent")} />
            </g>
          ))}
          <g transform={`translate(380 ${130 - cards * 4.5})`}>
            <circle r="9" fill={v("accent")} />
            <text x="0" y="3.8" textAnchor="middle" fontSize={pending > 9 ? 9 : 11} fontWeight="800" fill={v("accent-text")} fontFamily="system-ui,sans-serif">
              {pending > 99 ? "99+" : pending}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

/** The ground-floor lounge: sofas, a rug with the leaf, a coffee table. Decorative. 320 x 220. */
export function LoungeArt() {
  return (
    <svg viewBox="0 0 320 220" role="presentation" aria-hidden="true" focusable="false" className="hq-art" preserveAspectRatio="xMidYMid slice">
      <Shell>
        <Window x={118} y={26} w={84} h={58} />
        <use href="#hq-plant" transform="translate(40 150) scale(1.5)" />
        <rect x="236" y="30" width="58" height="36" rx="3" fill={v("paper")} opacity=".9" />
        <use href="#hq-leaf" transform="translate(255 36) scale(.9)" />
        <rect x="16" y="60" width="52" height="5" rx="2" fill={v("wood-l")} />
        <use href="#hq-books" transform="translate(22 60)" />
      </Shell>
      <ellipse cx="160" cy="190" rx="124" ry="22" fill={v("rug")} />
      <ellipse cx="160" cy="190" rx="92" ry="15" fill="none" stroke={v("paper")} strokeWidth="1.5" opacity=".5" />
      <use href="#hq-leaf" transform="translate(148 180) scale(.7)" opacity=".8" />
      <use href="#hq-sofa" transform="translate(26 176)" />
      <use href="#hq-sofa" transform="translate(262 176) scale(-1 1)" />
      <rect x="130" y="160" width="60" height="9" rx="4" fill={v("wood-l")} />
      <rect x="136" y="169" width="6" height="14" fill={v("wood-d")} />
      <rect x="178" y="169" width="6" height="14" fill={v("wood-d")} />
      <use href="#hq-mug" transform="translate(152 160)" />
      <use href="#hq-books" transform="translate(166 160) scale(.6)" />
      <use href="#hq-lamp" transform="translate(292 190)" />
      <Glow x={306} y={150} r={60} />
    </svg>
  );
}
