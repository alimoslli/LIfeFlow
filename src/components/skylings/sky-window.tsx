"use client";
import { useEffect, useState, type CSSProperties, type HTMLAttributes } from "react";
import { localNow } from "@/components/sky/sky-scene";
import { sunTimes } from "@/lib/day-clock";
import { css, darkness, mix, skyAt, type RGB } from "@/lib/sky";
import { cn } from "@/lib/utils";
import "./skylings.css";

/** Night ink the sky is pulled toward a little, so white words stay readable at noon too. */
const INK: RGB = [7, 19, 44];

function skyNow(tz: string) {
  let zone = tz;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    zone = "UTC";
  }
  const { date, minute } = localNow(zone);
  const { rise, set } = sunTimes(date, zone);
  const [top, mid, low] = skyAt(minute, rise, set);
  return {
    "--sw-a": css(mix(top, INK, 0.18)),
    "--sw-b": css(mix(mid, INK, 0.28)),
    "--sw-c": css(mix(low, INK, 0.14)),
    "--sw-stars": Math.round(darkness(minute, rise, set) * 100) / 100,
  } as CSSProperties;
}

/**
 * A window onto the person's real sky right now (the same sky Today draws): stars at night, clouds drifting by day.
 * The skyling pages (chat, Money, School) put the person's skyling in it on a perch. Repaints once a minute.
 */
export function SkyWindow({ tz, className, children, style, ...rest }: { tz: string } & HTMLAttributes<HTMLDivElement>) {
  const [sky, setSky] = useState(() => skyNow(tz));
  useEffect(() => {
    const id = window.setInterval(() => setSky(skyNow(tz)), 60_000);
    return () => window.clearInterval(id);
  }, [tz]);
  return (
    // the colours depend on the minute, so the server's paint may be a minute older than the browser's
    <div {...rest} className={cn("lf-sw relative isolate overflow-hidden", className)} style={{ ...sky, ...style }} suppressHydrationWarning>
      <span className="lf-sw-stars" aria-hidden />
      <PixelArt art={MOON} className="lf-sw-moon top-4 right-5 w-4" />
      {/* on the right, clear of the words on the left */}
      <PixelArt art={PUFF} className="lf-sw-puff top-[12%] right-[10%] w-12" />
      <PixelArt art={PUFF} className="lf-sw-puff lf-sw-puff-2 top-[30%] right-[27%] w-8" />
      {children}
    </div>
  );
}

type Art = { rows: string[]; colors: Record<string, string> };

/** Pixel art from rows of letters (each a colour, "." empty), drawn as crisp SVG runs. */
export function PixelArt({ art, className }: { art: Art; className?: string }) {
  const w = Math.max(...art.rows.map((r) => r.length));
  const runs: { x: number; y: number; n: number; c: string }[] = [];
  art.rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (row[x + n] === ch) n++;
      if (ch !== "." && art.colors[ch]) runs.push({ x, y, n, c: art.colors[ch] });
      x += n;
    }
  });
  return (
    <svg viewBox={`0 0 ${w} ${art.rows.length}`} className={cn("block", className)} shapeRendering="crispEdges" aria-hidden>
      {runs.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.n} height="1" fill={r.c} />
      ))}
    </svg>
  );
}

const MOON: Art = {
  rows: ["...MMMM..", ".MMMS....", ".MMS.....", "MMS......", "MMS......", "MMS......", ".MMS.....", ".MMMS....", "...MMMM.."],
  colors: { M: "#fff3cf", S: "#ffe2a0" },
};

const PUFF: Art = {
  rows: ["....XXXX....", "..XXXXXXXXX.", "XXXXXXXXXXXX"],
  colors: { X: "currentColor" },
};

/** A cloud to stand on. */
export const CLOUD: Art = {
  rows: ["......XXXX..........", "...XXXXXXXXX..XXX...", ".XXXXXXXXXXXXXXXXXX.", "XXXXXXXXXXXXXXXXXXXX", ".SSSSSSSSSSSSSSSSSS."],
  colors: { X: "#ffffff", S: "#d5e2f4" },
};

/** A little stack of coins (Money). */
export const COINS: Art = {
  rows: [
    "...YYYYYYYY...",
    "..YWWYYYYYYG..",
    "..GGGGGGGGGG..",
    "..OOOOOOOOOO..",
    ".GGGGGGGGGG...",
    ".OOOOOOOOOO...",
    "..GGGGGGGGGG..",
    "..OOOOOOOOOO..",
    "...GGGGGGGGGG.",
    "...OOOOOOOOOO.",
  ],
  colors: { Y: "#ffe9a6", W: "#fffbe8", G: "#fbb24a", O: "#c97a1f" },
};

/** A stack of books (School). */
export const BOOKS: Art = {
  rows: [
    "...RRRRRRRRRRR..",
    "...RPPPPPPPPPPr.",
    "...rrrrrrrrrrrr.",
    ".BBBBBBBBBBBBB..",
    ".BPPPPPPPPPPPPb.",
    ".bbbbbbbbbbbbbb.",
    "..GGGGGGGGGGGGG.",
    "..GPPPPPPPPPPPPg",
    "..ggggggggggggg.",
  ],
  colors: { R: "#f07a52", r: "#c4542a", B: "#5b8fe0", b: "#3a64a8", G: "#ffcf5c", g: "#d89a24", P: "#fff4dc" },
};

/** A star to stand on (Goals: Done). */
export const STAR: Art = {
  rows: [
    ".....GG.....",
    "....GYYG....",
    "....GYWG....",
    "GGGGGYWYGGGG",
    "GYYYYWYYYYYG",
    ".GYYYYYYYYG.",
    "..GYYYYYYG..",
    "..GYYYYYYG..",
    ".GYYYGGYYYG.",
    ".GYYG..GYYG.",
    ".GGG....GGG.",
  ],
  colors: { Y: "#ffcf5c", W: "#fff4dc", G: "#d89a24" },
};
