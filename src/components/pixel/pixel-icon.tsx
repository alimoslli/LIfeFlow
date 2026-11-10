import type { SVGProps } from "react";
import { cn } from "@/lib/utils";
import { COLOR, MONO, PIXEL_PALETTE, SOFT, type PixelName } from "./art";

type Run = [x: number, y: number, w: number, fill: string];

/** Rows of characters to runs of same-coloured pixels (fewer rects than one per pixel). */
function runs(rows: readonly string[], mono: boolean): Run[] {
  const out: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === ".") {
        x++;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === ch) end++;
      out.push([x, y, end - x, mono ? "currentColor" : (PIXEL_PALETTE[ch] ?? "currentColor")]);
      x = end;
    }
  });
  return out;
}

const cache = new Map<string, Run[]>();
function runsOf(name: PixelName): Run[] {
  let r = cache.get(name);
  if (!r) {
    const mono = name in MONO;
    const rows = mono ? MONO[name as keyof typeof MONO] : COLOR[name as keyof typeof COLOR];
    r = [...runs(rows, mono), ...runs(SOFT[name as keyof typeof COLOR] ?? [], false)];
    cache.set(name, r);
  }
  return r;
}

/**
 * One of our pixel icons as a crisp SVG (renders on the server, at any size). Decorative: the label beside it says
 * what it is. Takes an icon's className (h-4 w-4 ...); a one-colour icon follows the text colour.
 */
export function PixelIcon({ name, className, ...rest }: { name: PixelName; className?: string } & Omit<SVGProps<SVGSVGElement>, "name" | "className">) {
  return (
    <svg viewBox="0 0 16 16" className={cn("lf-pixel shrink-0", className)} shapeRendering="crispEdges" aria-hidden="true" {...rest}>
      {runsOf(name).map(([x, y, w, fill], i) => (
        <rect key={i} x={x} y={y} width={w} height="1" fill={fill} />
      ))}
    </svg>
  );
}

/** A pixel icon with a line icon's call shape (`<Icon className strokeWidth />`), for lists that hold either kind. */
export const pixel = (name: PixelName) => {
  // a line icon's stroke width means nothing here; anything else (data-icon, aria) goes onto the picture
  const Icon = ({
    className,
    strokeWidth: _stroke,
    ...rest
  }: { className?: string; strokeWidth?: number } & Omit<SVGProps<SVGSVGElement>, "name" | "className" | "strokeWidth">) => (
    <PixelIcon name={name} className={className} {...rest} />
  );
  Icon.displayName = `Pixel(${name})`;
  return Icon;
};
export type IconLike = ReturnType<typeof pixel>;
