import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import type { OfficeSnapshot, EmployeeCard } from "@/server/hq/types";
import { BrandMark } from "@/components/brand/brand-mark";
import { goodnightAction, lightsOnAction } from "@/app/admin/hq/actions";
import { Desk, OpenDeskButton, type DeskFileView } from "./desk";
import { StateChip } from "./status-chip";

export const CEO_LINE = "I'm CEO, Bitch.";
export const CEO_NAME = "Ali Moslli";
export const CEO_SITE = "lifeflowweb.com";

/**
 * The rendered office (owner, 2026-11-07: "it doesn't look like the thing I envisioned"): every room is a picture in the style of
 * the owner's concept (docs/hq/concept.webp), made once with an image model and stored in public/hq/office. Each person has three:
 * at the desk working, at the desk ready, and asleep in bed. Nothing calls an AI when HQ opens; the state picks the picture.
 */
const OFFICE = "/hq/office";
const PICTURE: Record<EmployeeCard["state"], "working" | "ready" | "asleep"> = {
  working: "working",
  done: "ready",
  ready: "ready",
  sleeping: "asleep",
  offline: "asleep",
};
/** Where the pile of task files sits in penthouse.webp, in percent of the picture (the desk button covers it). */
const PILE = { left: 15.5, top: 55, width: 17, height: 17 };

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

/** The CMO's seat over Marketing: a real partner joining later (owner, 2026-11-07). Not an employee, so no state. */
function CmoSeat() {
  return (
    <p className="hq-cmo" data-testid="hq-cmo">
      <b>CMO</b> · Your partner · <span>Coming soon</span>
    </p>
  );
}

function EmployeeRoom({ e }: { e: EmployeeCard }) {
  // DOM order gives the accessible name "Title, State: line, note, tagline"; the grid areas lay it out the way it reads on screen.
  return (
    <Link href={`/admin/hq/${e.role}`} className="hq-room" data-state={e.state}>
      <div className="hq-stage hq-stage-photo">
        <Image
          src={`${OFFICE}/${e.role}-${PICTURE[e.state]}.webp`}
          alt=""
          width={960}
          height={640}
          sizes="(min-width: 1024px) 26rem, 50vw"
          className="hq-photo"
        />
        {e.state === "sleeping" && (
          <span className="hq-zs" aria-hidden="true">
            <i>z</i>
            <i>z</i>
            <i>Z</i>
          </span>
        )}
        {e.state === "done" && (
          <span className="hq-done-badge" aria-hidden="true">
            ✓
          </span>
        )}
      </div>
      <div className="hq-meta">
        {e.role === "marketing" && <CmoSeat />}
        <p className="hq-plate-title">
          {e.title}
          <span className="sr-only">, </span>
        </p>
        <StateChip state={e.state} />
        <span className="sr-only">: </span>
        <p className="hq-line">{e.line}</p>
        {e.note && (
          <p className="hq-note">
            <span className="sr-only">. Note: </span>
            {e.note}
          </p>
        )}
        <p className="hq-plate-tag">{e.tagline}</p>
      </div>
    </Link>
  );
}

export type OfficeDesk = { files: DeskFileView[]; roles: { role: string; title: string }[]; night: { on: boolean; endsAt: Date | null } };

/** The penthouse: the CEO at the desk with the pile of task files and the closed MacBook, three plain buttons, the business card. */
function Penthouse({ pending, desk }: { pending: number; desk: OfficeDesk }) {
  const n = desk.files.length;
  return (
    <div className="hq-room hq-room-founder" data-state={pending > 0 ? "needs_you" : "sleeping"} id="desk">
      <div className="hq-stage hq-stage-penthouse">
        <div
          className="hq-founder-art"
          style={{ "--pile-l": `${PILE.left}%`, "--pile-t": `${PILE.top}%`, "--pile-w": `${PILE.width}%`, "--pile-h": `${PILE.height}%` } as CSSProperties}
        >
          <Image src={`${OFFICE}/penthouse.webp`} alt="" width={1536} height={1024} sizes="(min-width: 1024px) 52rem, 100vw" className="hq-photo" priority />
          {n > 0 && (
            <span className="hq-pile-count" aria-hidden="true">
              {n > 99 ? "99+" : n}
            </span>
          )}
          <Desk files={desk.files} roles={desk.roles} />
        </div>
        <BusinessCard />
      </div>
      <div className="hq-plate">
        <div className="min-w-0">
          <p className="hq-plate-title">Founder Office</p>
          <p className="hq-plate-tag">CEO · {n === 0 ? "Nothing on your desk" : `${n} ${n === 1 ? "file" : "files"} on your desk`}</p>
        </div>
      </div>
      <div className="hq-founder-actions">
        <OpenDeskButton count={n} className="hq-fbtn hq-fbtn-desk" />
        <Link href="/admin/work#approvals" className={pending > 0 ? "hq-fbtn hq-fbtn-gold" : "hq-fbtn"}>
          {pending > 0 ? `${pending} ${pending === 1 ? "needs" : "need"} your yes` : "Nothing needs your yes"}
        </Link>
        {desk.night.on ? (
          <form action={lightsOnAction}>
            <button className="hq-fbtn">
              <Sun className="h-4 w-4" aria-hidden /> Lights on
            </button>
          </form>
        ) : (
          <form action={goodnightAction}>
            <button className="hq-fbtn">
              <Moon className="h-4 w-4" aria-hidden /> Goodnight
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/**
 * The whole building: crest, the penthouse (the Founder Office with the business card), then the floors. Rooms are laid in one
 * DOM order; the grid groups them two to a floor on a phone and three to a floor on a wide screen (floor labels switch with it).
 * Server-rendered, no client JS.
 */
export function OfficeScene({ snapshot, desk }: { snapshot: OfficeSnapshot; desk: OfficeDesk }) {
  const n = snapshot.founder.pendingApprovals;
  const e = Object.fromEntries(snapshot.employees.map((x) => [x.role, x])) as Record<string, EmployeeCard | undefined>;
  const room = (role: string) => (e[role] ? <EmployeeRoom e={e[role]!} /> : null);
  return (
    <div className="hq-tower" data-night={desk.night.on ? "on" : undefined}>
      <Crest />
      <div className="hq-floors">
        <Slab>Penthouse</Slab>
        <Penthouse pending={n} desk={desk} />
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
          <div className="hq-stage hq-stage-photo">
            <Image src={`${OFFICE}/lounge.webp`} alt="" width={960} height={640} sizes="(min-width: 1024px) 52rem, 100vw" className="hq-photo" />
          </div>
          <Plate title="Lounge" tagline="Coffee · Quiet · Everyone" />
        </div>
      </div>
    </div>
  );
}
