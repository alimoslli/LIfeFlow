import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { BriefcaseBusiness, CodeXml, Crown, HeartHandshake, Megaphone, Moon, PenTool, Search, ShieldCheck, Sofa, Sun, type LucideIcon } from "lucide-react";
import type { OfficeSnapshot, EmployeeCard } from "@/server/hq/types";
import { BrandMark } from "@/components/brand/brand-mark";
import { goodnightAction, lightsOnAction } from "@/app/admin/hq/actions";
import { Desk, OpenDeskButton, type DeskFileView } from "./desk";
import { StateChip } from "./status-chip";
import "./building.css";

export const CEO_LINE = "I'm CEO, Bitch.";
export const CEO_NAME = "Ali Moslli";
export const CEO_SITE = "lifeflowweb.com";

/**
 * The headquarters building (owner, 2026-11-07: "the more headquarters building design, keeping the brand and the simplicity"):
 * one building cut open like the owner's concept (docs/hq/concept.webp). A rendered roof carries the LifeFlow HQ sign (the real
 * brand mark, in HTML); below it the rooms sit side by side between walnut walls and floor beams, each a picture made once in
 * the concept's style (public/hq/office) with its name, state and one line on the room itself. Nothing calls an AI when HQ
 * opens; the room's real state only picks the picture.
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
/** The blank sign panel in roof.webp, in percent of the picture: the brand mark and name are drawn over it. */
const SIGN = { left: 31.9, top: 30, width: 35.7, height: 40 };

const ICON: Record<string, LucideIcon> = {
  assistant: BriefcaseBusiness,
  developer: CodeXml,
  designer: PenTool,
  researcher: Search,
  marketing: Megaphone,
  qa: ShieldCheck,
  support: HeartHandshake,
};

/** The CEO's business card, pinned to the penthouse. Plain text (no address, phone or social), with one label for screen readers. */
function BusinessCard() {
  return (
    <div className="hq-bcard" role="img" aria-label={`Business card: ${CEO_LINE} ${CEO_NAME}, LifeFlow Corporate Headquarters, ${CEO_SITE}`}>
      <i className="hq-bcard-pin" aria-hidden="true" />
      <b className="hq-bcard-l1">{CEO_LINE}</b>
      <span className="hq-bcard-l2">{CEO_NAME}</span>
      <span className="hq-bcard-l3">
        <BrandMark className="h-3 w-3" alt="" />
        <span>LifeFlow Corporate Headquarters</span>
      </span>
      <span className="hq-bcard-l4">{CEO_SITE}</span>
    </div>
  );
}

/** The roof: the rendered crown with the glowing LifeFlow HQ sign. */
function Roof() {
  return (
    <div className="hq-roof">
      <div
        className="hq-roof-art"
        style={{ "--sign-l": `${SIGN.left}%`, "--sign-t": `${SIGN.top}%`, "--sign-w": `${SIGN.width}%`, "--sign-h": `${SIGN.height}%` } as CSSProperties}
      >
        <Image src={`${OFFICE}/roof.webp`} alt="" width={1200} height={413} sizes="(min-width: 1024px) 38rem, 100vw" className="hq-roof-img" priority />
        <p className="hq-roof-sign">
          <BrandMark className="hq-roof-mark" alt="" />
          <span>
            LifeFlow <b>HQ</b>
          </span>
        </p>
      </div>
      <div className="hq-cornice" aria-hidden="true" />
    </div>
  );
}

/** A floor beam with the floor's name. `on` lists the layouts it shows in: p (phone, one room a floor), t (tablet, two), d (wide, three). */
function Slab({ children, on = "ptd" }: { children: string; on?: string }) {
  return (
    <p
      className={`hq-slab ${[..."ptd"]
        .filter((l) => !on.includes(l))
        .map((l) => `hq-slab-no${l}`)
        .join(" ")}`}
    >
      {children}
    </p>
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
  const Icon = ICON[e.role] ?? BriefcaseBusiness;
  // DOM order gives the accessible name "Title, State: line, note, tagline"; the grid puts the title, tagline and chip on the
  // label at the top of the room (like the concept) and the line and note at the bottom.
  return (
    <Link href={`/admin/hq/${e.role}`} className="hq-room" data-state={e.state} data-role={e.role}>
      <div className="hq-stage">
        <Image
          src={`${OFFICE}/${e.role}-${PICTURE[e.state]}.webp`}
          alt=""
          width={960}
          height={640}
          sizes="(min-width: 1024px) 20rem, (min-width: 640px) 50vw, 100vw"
          className="hq-photo"
        />
        {e.state === "sleeping" && (
          <span className="hq-zs" aria-hidden="true">
            <i>z</i>
            <i>z</i>
            <i>Z</i>
          </span>
        )}
      </div>
      <div className="hq-meta">
        <span className="hq-label-bg" aria-hidden="true" />
        <span className="hq-ico" aria-hidden="true">
          <Icon />
        </span>
        <p className="hq-title">
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
        <p className="hq-tag">{e.tagline}</p>
        {e.role === "marketing" && <CmoSeat />}
      </div>
    </Link>
  );
}

export type OfficeDesk = { files: DeskFileView[]; roles: { role: string; title: string }[]; night: { on: boolean; endsAt: Date | null } };

/** The penthouse: the CEO at the desk with the pile of task files and the closed MacBook, the business card, three plain buttons. */
function Penthouse({ pending, desk }: { pending: number; desk: OfficeDesk }) {
  const n = desk.files.length;
  return (
    <div className="hq-room hq-room-founder" data-state={pending > 0 ? "needs_you" : "ready"} id="desk">
      <div className="hq-stage hq-stage-penthouse">
        <div
          className="hq-founder-art"
          style={{ "--pile-l": `${PILE.left}%`, "--pile-t": `${PILE.top}%`, "--pile-w": `${PILE.width}%`, "--pile-h": `${PILE.height}%` } as CSSProperties}
        >
          <Image src={`${OFFICE}/penthouse.webp`} alt="" width={1536} height={1024} sizes="(min-width: 1024px) 40rem, 100vw" className="hq-photo" priority />
          {n > 0 && (
            <span className="hq-pile-count" aria-hidden="true">
              {n > 99 ? "99+" : n}
            </span>
          )}
          <Desk files={desk.files} roles={desk.roles} />
        </div>
        <div className="hq-label hq-label-founder">
          <span className="hq-ico" aria-hidden="true">
            <Crown />
          </span>
          <div className="min-w-0">
            <p className="hq-title">Founder Office</p>
            <p className="hq-tag">
              CEO
              <span className="max-sm:hidden"> · {n === 0 ? "Nothing on your desk" : `${n} ${n === 1 ? "file" : "files"} on your desk`}</span>
            </p>
          </div>
        </div>
        <BusinessCard />
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
 * The whole building: the roof and its sign, the penthouse (the Founder Office and the COO), the floors, the lobby and the steps.
 * Rooms are laid in one DOM order; the grid stacks one room a floor on a phone, two on a tablet and three on a wide screen, and
 * the floor beams' names switch with it. Server-rendered, no client JS (the desk is its own client part).
 */
export function OfficeScene({ snapshot, desk }: { snapshot: OfficeSnapshot; desk: OfficeDesk }) {
  const n = snapshot.founder.pendingApprovals;
  const e = Object.fromEntries(snapshot.employees.map((x) => [x.role, x])) as Record<string, EmployeeCard | undefined>;
  const room = (role: string) => (e[role] ? <EmployeeRoom e={e[role]!} /> : null);
  return (
    <div className="hq-tower" data-night={desk.night.on ? "on" : undefined}>
      <Roof />
      <div className="hq-floors">
        <Slab>Penthouse</Slab>
        <Penthouse pending={n} desk={desk} />
        <Slab on="p">Floor 7</Slab>
        <Slab on="t">Floor 4</Slab>
        {room("assistant")}
        <Slab on="p">Floor 6</Slab>
        <Slab on="d">Floor 2</Slab>
        {room("developer")}
        <Slab on="p">Floor 5</Slab>
        <Slab on="t">Floor 3</Slab>
        {room("designer")}
        <Slab on="p">Floor 4</Slab>
        {room("researcher")}
        <Slab on="p">Floor 3</Slab>
        <Slab on="t">Floor 2</Slab>
        <Slab on="d">Floor 1</Slab>
        {room("marketing")}
        <Slab on="p">Floor 2</Slab>
        {room("qa")}
        <Slab on="p">Floor 1</Slab>
        <Slab on="t">Ground</Slab>
        {room("support")}
        <Slab on="pd">Lobby</Slab>
        <div className="hq-room hq-room-lounge" data-state="lounge">
          <div className="hq-stage">
            <Image
              src={`${OFFICE}/lounge.webp`}
              alt=""
              width={960}
              height={640}
              sizes="(min-width: 1024px) 60rem, (min-width: 640px) 50vw, 100vw"
              className="hq-photo"
            />
          </div>
          <div className="hq-label">
            <span className="hq-ico" aria-hidden="true">
              <Sofa />
            </span>
            <div className="min-w-0">
              <p className="hq-title">Lounge</p>
              <p className="hq-tag">Coffee · Quiet · Everyone</p>
            </div>
          </div>
        </div>
      </div>
      <div className="hq-plinth" aria-hidden="true" />
    </div>
  );
}
