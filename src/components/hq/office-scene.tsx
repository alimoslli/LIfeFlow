import Link from "next/link";
import type { ReactNode } from "react";
import type { OfficeSnapshot, EmployeeCard } from "@/server/hq/types";
import { BrandMark } from "@/components/brand/brand-mark";
import { SceneDefs } from "./parts";
import { EmployeeRoomArt, FounderRoomArt, LoungeArt } from "./rooms";
import { StateChip } from "./status-chip";

export const CEO_LINE = "I'm CEO, Bitch.";
export const CEO_NAME = "Ali Moslli";
export const CEO_SITE = "lifeflowweb.com";

/** The CEO's business card, pinned to the penthouse. Plain text (no address, phone or social), with one label for screen readers. */
function BusinessCard() {
  return (
    <div className="hq-bcard" role="img" aria-label={`Business card: ${CEO_LINE} ${CEO_NAME}, LifeFlow Corporate Headquarters, ${CEO_SITE}`}>
      <i className="hq-bcard-pin" aria-hidden="true" />
      <b className="hq-bcard-l1">{CEO_LINE}</b>
      <span className="hq-bcard-l2">{CEO_NAME}</span>
      <span className="hq-bcard-l3">
        <BrandMark className="h-5 w-5" alt="" />
        <span>
          LifeFlow
          <br />
          Corporate Headquarters
        </span>
      </span>
      <span className="hq-bcard-l4">{CEO_SITE}</span>
    </div>
  );
}

/** The tower's crest and name. */
function Crest() {
  return (
    <>
      <div className="hq-crown" aria-hidden="true">
        <div className="hq-medal">
          <BrandMark className="h-16 w-16" alt="" />
        </div>
      </div>
      <p className="hq-sign">
        LifeFlow <span>Headquarters</span>
      </p>
    </>
  );
}

const Slab = ({ children, only }: { children: string; only?: "p" | "d" }) => <p className={only ? `hq-slab hq-slab-${only}` : "hq-slab"}>{children}</p>;

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
    <Link href={`/admin/hq/${e.role}`} className="hq-room" data-state={e.state}>
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

/**
 * The whole building: crest, the penthouse (the Founder Office with the business card), then the floors. Rooms are laid in one
 * DOM order; the grid groups them two to a floor on a phone and three to a floor on a wide screen (floor labels switch with it).
 * Server-rendered, no client JS.
 */
export function OfficeScene({ snapshot }: { snapshot: OfficeSnapshot }) {
  const n = snapshot.founder.pendingApprovals;
  const e = Object.fromEntries(snapshot.employees.map((x) => [x.role, x])) as Record<string, EmployeeCard | undefined>;
  const room = (role: string) => (e[role] ? <EmployeeRoom e={e[role]!} /> : null);
  return (
    <div className="hq-tower">
      <SceneDefs />
      <Crest />
      <div className="hq-floors">
        <Slab>Penthouse</Slab>
        <Link href="/admin/work" className="hq-room hq-room-founder" data-state={n > 0 ? "needs_you" : "sleeping"}>
          <div className="hq-stage hq-stage-wide">
            <FounderRoomArt pending={n} />
          </div>
          <div className="hq-plate">
            <div className="min-w-0">
              <p className="hq-plate-title">Founder Office</p>
              <p className="hq-plate-tag">{n > 0 ? `${n} ${n === 1 ? "thing needs" : "things need"} your yes` : "Nothing waiting for you"}</p>
            </div>
          </div>
          <BusinessCard />
        </Link>
        <Slab only="p">Floor 4</Slab>
        {room("assistant")}
        <Slab only="d">Floor 2</Slab>
        {room("developer")}
        <Slab only="p">Floor 3</Slab>
        {room("designer")}
        {room("researcher")}
        <Slab only="p">Floor 2</Slab>
        <Slab only="d">Floor 1</Slab>
        {room("marketing")}
        {room("qa")}
        <Slab only="p">Ground</Slab>
        {room("support")}
        <Slab only="d">Lobby</Slab>
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
