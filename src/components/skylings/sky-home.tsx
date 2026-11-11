"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { STAR_ITEMS, SUN_ITEMS, countLine, nextLine, unlocked, type HomeItem, type SkyCounts } from "@/lib/sky-home";
import type { CompanionKey } from "@/lib/companions";
import { cn } from "@/lib/utils";
import { ART, STAR_ICON, SUN_ICON, cloud, lights, runs, widthOf } from "./home-art";
import { SkylingSprite } from "./sprite";

/** One cell of the skylings' grid, in px: every pixel lands on a screen pixel. */
const S = 4;
/** The scene is drawn this many cells wide and centred in a wider window. */
const COMP = 89;
/** Rows above the scene the speech bubble keeps (it sits at the top right). */
const TOP = 26;

/** Where the cloud's top row is and how tall the window is, from what's on the cloud (cells). */
function layout(has: Set<string>) {
  // the planet and the garden float above the skyling's head, under the bubble; everything else fits lower
  const cy = has.has("planet") || has.has("garden") ? TOP + 33 : TOP + 20;
  const under = has.has("swing") || has.has("hammock") || has.has("slide");
  return { cy, rows: cy + (under ? 20 : 9) };
}

/** How tall the skyling's window is with its cloud (px). */
export function homeHeight(counts: SkyCounts) {
  return layout(unlocked(counts)).rows * S;
}

function Pic({ art, x, y, ghost }: { art: string[]; x: number; y: number; ghost?: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {runs(art, ghost).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.n} height={1} fill={r.fill} />
      ))}
    </g>
  );
}

/** A little pixel picture as its own svg (the counts, the sheet's tiles); `cell` px a pixel, or sized by its class. */
function Icon({ art, className, ghost, cell }: { art: string[]; className?: string; ghost?: boolean; cell?: number }) {
  const size = cell ? { width: widthOf(art) * cell, height: art.length * cell } : {};
  return (
    <svg viewBox={`0 0 ${widthOf(art)} ${art.length}`} {...size} className={cn("block", className)} shapeRendering="crispEdges" aria-hidden>
      <Pic art={art} x={0} y={0} ghost={ghost ? "currentColor" : undefined} />
    </svg>
  );
}

/**
 * The skyling's cloud (owner, 2026-11-11, from the picture he said yes to): the person's own skyling stands on it (with
 * "Changes with the sky", whoever is up), and what their stars and suns unlocked lives around it. Drawn in code on the
 * 4 px grid; still, so it's the same under reduced motion. The counts open the sheet.
 */
export function SkyHome({ counts, skyling, name }: { counts: SkyCounts; skyling?: CompanionKey | null; name: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [night, setNight] = useState(false);
  const [open, setOpen] = useState(false);
  const glow = useId();
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      // the window's own sky says how dark it is (the lights glow at night)
      const sky = el.closest<HTMLElement>(".lf-sw");
      setNight(!!sky && Number(getComputedStyle(sky).getPropertyValue("--sw-stars")) > 0.5);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const id = window.setInterval(measure, 60_000);
    return () => (ro.disconnect(), window.clearInterval(id));
  }, []);

  const has = unlocked(counts);
  const { cy, rows } = layout(has);
  const W = Math.floor(width / S);
  // a phone centres it under the bubble; a wide window keeps it on the left with the bubble beside it
  const ox = W >= 150 ? 4 : Math.max(0, Math.floor((W - COMP) / 2));
  const cx = ox + 3;
  const cw = 72;
  const stand = cy + 2;
  const at = (key: string, x: number, y: number) => has.has(key) && <Pic art={ART[key]} x={x} y={y} />;
  const kite = { x: ox + 46, y: Math.max(TOP + 1, cy - 27) };
  const balloon = { x: cx + 1, y: cy - 33 };
  const rope = (x: number, y0: number, y1: number) => y1 > y0 && <rect x={x} y={y0} width={0.5} height={y1 - y0} fill="#8a5a3c" />;

  return (
    <div ref={box} className="absolute inset-0" data-testid="sky-home">
      {W > 0 && (
        <svg
          width={W * S}
          height={rows * S}
          viewBox={`0 0 ${W} ${rows}`}
          className="absolute top-0 left-0"
          shapeRendering="crispEdges"
          aria-hidden
          data-has={[...has].sort().join(" ")}
        >
          <defs>
            <radialGradient id={glow}>
              <stop offset="0" stopColor="#ffdc6e" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffdc6e" stopOpacity="0" />
            </radialGradient>
          </defs>
          {has.has("planet") && <Pic art={ART.planet} x={ox + 18} y={TOP + 2} />}
          {at("garden", ox + 58, cy - 27)}
          {has.has("kite") && (
            <>
              <Pic art={ART.kite} x={kite.x} y={kite.y} />
              {Array.from({ length: 12 }, (_, i) => (
                <rect
                  key={i}
                  x={kite.x + 4 + ((ox + 49 - kite.x - 4) * i) / 12}
                  y={kite.y + 17 + ((cy - kite.y - 17) * i) / 12}
                  width={0.5}
                  height={0.5}
                  fill="rgb(255 255 255 / 0.75)"
                />
              ))}
            </>
          )}
          {has.has("balloon") && (
            <>
              <Pic art={ART.balloon} x={balloon.x} y={balloon.y} />
              {rope(balloon.x + 6, balloon.y + 17, has.has("house") ? stand - 15 : stand - 1)}
            </>
          )}
          {at("hammock", cx + 8, cy + 6)}
          {at("swing", cx + 42, cy + 6)}
          {at("slide", cx + cw - 4, cy + 3)}
          {has.has("lights") && night && (
            <g fill={`url(#${glow})`}>
              {Array.from({ length: Math.floor((cw - 10) / 9) + 1 }, (_, i) => (
                <circle key={i} cx={cx + 3 + 2 + i * 9 + 0.5} cy={cy + 3.5} r={6} />
              ))}
            </g>
          )}
          <Pic art={cloud(cw)} x={cx} y={cy} />
          {at("house", cx + 1, stand - 15)}
          {at("telescope", cx + 44, stand - 12)}
          {at("puff", cx + 58, stand - 8)}
          {has.has("lights") && <Pic art={lights(cw - 6)} x={cx + 3} y={cy + 1} />}
        </svg>
      )}
      {W > 0 && (
        // the sprite is the 24 x 24 grid; its feet stand on the cloud's top
        <div className="absolute z-10" style={{ left: (cx + 20) * S, top: (stand - 22) * S, width: 24 * S, height: 24 * S }}>
          <SkylingSprite companion={skyling} className="h-full w-full cursor-pointer" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${countLine(counts)} Open ${name}'s cloud`}
        className="lf-chip-night absolute top-3 left-3 z-20 flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[0.8125rem] font-semibold"
      >
        <Icon art={STAR_ICON} className="h-3.5 w-3.5" />
        {counts.stars.toLocaleString("en-US")}
        <Icon art={SUN_ICON} className="ml-1 h-[1.125rem] w-[1.125rem]" />
        {counts.suns.toLocaleString("en-US")}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={`${name}'s cloud`}>
        <HomeSheet counts={counts} />
      </Sheet>
    </div>
  );
}

/** Whole px a pixel so a tile's picture is crisp: as big as fits 40 px high and 76 px wide, 1 to 3. */
const cellFor = (art: string[]) => Math.max(1, Math.min(3, Math.floor(Math.min(40 / art.length, 76 / widthOf(art)))));

function Row({ icon, title, items, n, unit, why }: { icon: string[]; title: string; items: HomeItem[]; n: number; unit: string; why: string }) {
  return (
    <section className="mt-4" aria-label={title}>
      <div className="flex items-center gap-2">
        <Icon art={icon} className="h-4 w-4" />
        <h3 className="text-base font-bold">{title}</h3>
        <span className="ml-auto text-sm font-semibold text-text-2">{nextLine(items, n) ?? "All here"}</span>
      </div>
      <p className="mt-0.5 text-sm text-muted">{why}</p>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {items.map((it) => {
          const have = n >= it.at;
          return (
            <li key={it.key} className="flex flex-col items-center gap-1 rounded-[1rem] bg-surface-2 px-1 pt-2.5 pb-2 text-center">
              <span className={cn("flex h-10 items-end", !have && "text-text opacity-[0.16]")}>
                <Icon art={ART[it.key]} ghost={!have} cell={cellFor(ART[it.key])} />
              </span>
              <span className="text-[0.75rem] leading-tight font-semibold">{it.name}</span>
              <span className="text-[0.6875rem] text-muted">{have ? "On the cloud" : `At ${it.at} ${unit}${it.at === 1 ? "" : "s"}`}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the stars and suns unlock, with what comes next; plain words, no numbers to work out. */
function HomeSheet({ counts }: { counts: SkyCounts }) {
  return (
    <div className="pb-2" data-testid="sky-home-sheet">
      <p className="text-[0.9375rem] text-text-2">{countLine(counts)}</p>
      <Row icon={STAR_ICON} title="Stars" items={STAR_ITEMS} n={counts.stars} unit="star" why="One for every class, shift and to-do you finish." />
      <Row icon={SUN_ICON} title="Suns" items={SUN_ITEMS} n={counts.suns} unit="sun" why="Only for the big things: a goal reached or a milestone." />
    </div>
  );
}
