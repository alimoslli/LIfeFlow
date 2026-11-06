import Link from "next/link";
import type { ReactNode } from "react";
import type { OfficeSnapshot, EmployeeCard } from "@/server/hq/types";
import { SceneDefs, v } from "./parts";
import { EmployeeRoomArt, FounderRoomArt, LoungeArt } from "./rooms";
import { StateChip } from "./status-chip";

export const DOOR_PLATE = "I'M THE CEO, BITCH";

function Roof() {
  return (
    <div className="hq-roof" aria-hidden="true">
      <svg viewBox="0 0 600 70" preserveAspectRatio="none" width="100%" height="100%" focusable="false">
        <path d="M0 70L40 12Q50 4 70 4H530Q550 4 560 12L600 70Z" fill={v("roof")} />
        <path d="M0 70L40 12Q50 4 70 4H530Q550 4 560 12L600 70" fill="none" stroke="#000" strokeOpacity=".12" strokeWidth="3" />
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M${20 + i * 42} 66l18-52`} stroke="#fff" strokeOpacity=".06" strokeWidth="6" />
        ))}
      </svg>
      <div className="hq-roof-plants">
        <svg viewBox="0 0 400 40" width="100%" height="100%" preserveAspectRatio="xMinYMax meet" focusable="false">
          {[30, 96, 160, 232, 300, 366].map((x, i) => (
            <use key={x} href="#hq-plant" transform={`translate(${x} 40) scale(${0.9 + (i % 3) * 0.2})`} />
          ))}
        </svg>
      </div>
      <div className="hq-sign">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <use href="#hq-leaf" transform="translate(1 1) scale(.9)" />
        </svg>
        <span>LifeFlow HQ</span>
      </div>
    </div>
  );
}

function Plate({ title, tagline, chip }: { title: string; tagline: string; chip?: ReactNode }) {
  return (
    <div className="hq-plate">
      <div className="min-w-0">
        <p className="hq-plate-title">{title}</p>
        <p className="hq-plate-tag">{tagline}</p>
      </div>
      {chip}
    </div>
  );
}

function EmployeeRoom({ e }: { e: EmployeeCard }) {
  // DOM order gives the accessible name "Title, State: line, tagline"; the grid areas lay it out the way it reads on screen.
  return (
    <Link href={`/admin/hq/${e.role}`} className={e.role === "assistant" ? "hq-room hq-room-chief" : "hq-room"} data-state={e.state}>
      <div className={e.role === "assistant" ? "hq-stage hq-stage-chief" : "hq-stage"}>
        <EmployeeRoomArt role={e.role} state={e.state} />
      </div>
      <div className="hq-meta">
        <p className="hq-plate-title">
          {e.title}
          <span className="sr-only">, </span>
        </p>
        <StateChip state={e.state} />
        <span className="sr-only">: </span>
        <p className="hq-line">{e.line}</p>
        <p className="hq-plate-tag">{e.tagline}</p>
      </div>
    </Link>
  );
}

/** The whole building: roof and sign, the founder's corner office on top, seven employee rooms and the lounge. Server-rendered, no client JS. */
export function OfficeScene({ snapshot }: { snapshot: OfficeSnapshot }) {
  const n = snapshot.founder.pendingApprovals;
  return (
    <div className="hq-building">
      <SceneDefs />
      <Roof />
      <div className="hq-floors">
        <Link href="/admin/hq/founder" className="hq-room hq-room-founder" data-state={n > 0 ? "needs_you" : "sleeping"}>
          <div className="hq-stage hq-stage-wide">
            <FounderRoomArt pending={n} />
          </div>
          <div className="hq-plate">
            <div className="min-w-0">
              <p className="hq-plate-title">Founder Office</p>
              <p className="hq-plate-tag">{n > 0 ? `${n} ${n === 1 ? "thing needs" : "things need"} your yes` : "Nothing waiting for you"}</p>
            </div>
            <span className="hq-brass">{DOOR_PLATE}</span>
          </div>
        </Link>
        {snapshot.employees.map((e) => (
          <EmployeeRoom key={e.role} e={e} />
        ))}
        <div className="hq-room hq-room-lounge" data-state="lounge">
          <div className="hq-stage">
            <LoungeArt />
          </div>
          <Plate title="Lounge" tagline="Coffee · Quiet · Everyone" />
        </div>
      </div>
    </div>
  );
}
