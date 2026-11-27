import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { F } from "./fonts";
import { ease, prog, useLayout } from "./util";

/** A headline that lands word by word (each word rises and sharpens in). `at` = start frame. */
export function KineticTitle({
  text,
  at = 0,
  size = 96,
  color = "#fff",
  font = F.display,
  weight = 700,
  stagger = 3,
  gold,
  y,
  align = "center",
  shadow = true,
}: {
  text: string;
  at?: number;
  size?: number;
  color?: string;
  font?: string;
  weight?: number;
  stagger?: number;
  /** words to paint in the sun gold */
  gold?: string[];
  y?: number;
  align?: "center" | "left";
  shadow?: boolean;
}) {
  const frame = useCurrentFrame();
  const L = useLayout();
  const words = text.split(" ");
  return (
    <div
      style={{
        position: "absolute",
        left: L.safe.side,
        right: L.safe.side,
        top: y ?? "auto",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: align === "center" ? "center" : "flex-start",
        gap: `0 ${size * 0.26 * L.u}px`,
        fontFamily: font,
        fontWeight: weight,
        fontSize: size * L.u,
        lineHeight: 1.06,
        letterSpacing: "-0.01em",
        color,
        textShadow: shadow ? "0 4px 24px rgb(4 10 24 / 0.45)" : undefined,
      }}
    >
      {words.map((w, i) => {
        const p = prog(frame, at + i * stagger, at + i * stagger + 12);
        const isGold = gold?.some((g) => w.toLowerCase().replace(/[^\w$]/g, "").startsWith(g.toLowerCase()));
        return (
          <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 0.35 * size}px)`, filter: `blur(${(1 - p) * 8}px)`, color: isGold ? "#ffd77a" : undefined }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}
export type Word = { w: string; s: number; e: number };
/** Word-by-word captions (the house style: the spoken word in gold), timed in seconds within the scene. */
export function Captions({ words, y, size = 62, maxWords = 4 }: { words: Word[]; y?: number; size?: number; maxWords?: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const L = useLayout();
  const t = frame / fps;
  const groups: Word[][] = [];
  let cur: Word[] = [];
  for (const w of words) {
    cur.push(w);
    if (cur.length === maxWords || /[.?!]$/.test(w.w)) (groups.push(cur), (cur = []));
  }
  if (cur.length) groups.push(cur);
  const g = groups.find((g) => t >= g[0].s - 0.05 && t <= g[g.length - 1].e + 0.25);
  if (!g) return null;
  const pop = interpolate(t, [g[0].s - 0.05, g[0].s + 0.08], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return (
    <div style={{ position: "absolute", left: L.safe.side, right: L.safe.side, top: y ?? L.height - L.safe.bottom - size * L.u * 1.6, textAlign: "center", fontFamily: F.ui, fontWeight: 700, fontSize: size * L.u, lineHeight: 1.15 }}>
      {g.map((w, i) => (
        <span key={i} style={{ color: t >= w.s && t < w.e + 0.05 ? "#ffd77a" : "#fff", opacity: pop * (t >= w.s ? 1 : 0.6), WebkitTextStroke: `${7 * L.u}px #0a0e1c`, paintOrder: "stroke fill" }}>
          {w.w}{" "}
        </span>
      ))}
    </div>
  );
}
/** Build caption word timings from a line and its start/end (even spacing; good enough for on-screen text without a voice). */
export function wordsOf(line: string, s: number, e: number): Word[] {
  const ws = line.split(" ");
  const d = (e - s) / ws.length;
  return ws.map((w, i) => ({ w, s: s + i * d, e: s + (i + 1) * d }));
}
