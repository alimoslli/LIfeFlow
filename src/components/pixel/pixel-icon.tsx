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

/** One path per colour (`M x y h w v1 h-w z` per run): the same pixels as a rect each, a tenth of the markup. */
type Layer = { fill: string; d: string };
function layers(rs: Run[]): Layer[] {
  const by = new Map<string, string>();
  for (const [x, y, w, fill] of rs) by.set(fill, (by.get(fill) ?? "") + `M${x} ${y}h${w}v1h-${w}z`);
  return [...by].map(([fill, d]) => ({ fill, d }));
}

const cache = new Map<string, Layer[]>();
function layersOf(name: PixelName): Layer[] {
  let r = cache.get(name);
  if (!r) {
    const mono = name in MONO;
    const rows = mono ? MONO[name as keyof typeof MONO] : COLOR[name as keyof typeof COLOR];
    // the soft pixels (rays, steam) go last so they sit on top, as before
    r = [...layers(runs(rows, mono)), ...layers(runs(SOFT[name as keyof typeof COLOR] ?? [], false))];
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
      {layersOf(name).map((l, i) => (
        <path key={i} d={l.d} fill={l.fill} />
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
