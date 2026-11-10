/**
 * Visitors in Today's sky (owner, 2026-11-09: "that small guy has a life to him too, and it's just fun to see how
 * sometimes it interrupts from space ... make it cool, make it creative, make it not always pop up randomly").
 *
 * Now and then something crosses the sky: at night a shooting star, a satellite blinking its way over, and once in a
 * long while a little craft that stops over the skyling and beams it (it jumps); by day a flock of birds, a plane with
 * its trail, and once in a while a balloon. Never more than one at a time, a minute or two apart at least, only while
 * Today is closed and on screen, and never with reduced motion. Pixel art, moved by the compositor (Web Animations).
 */
export type VisitorKind = "shooting" | "satellite" | "craft" | "birds" | "plane" | "balloon";

type Opts = {
  /** The sky element the visitors fly in (they're clipped to it). */
  sky: HTMLElement;
  isNight: () => boolean;
  /** Today is closed, still and on screen: a visitor may come. */
  canVisit: () => boolean;
  /** Where the skyling stands, in the sky element's coordinates (the craft stops over it). */
  companionAt: () => { x: number; y: number } | null;
  /** A visitor arrived where the skyling can see it (it reacts). */
  onSeen: (kind: VisitorKind, x: number) => void;
};

const svg = (w: number, h: number, body: string, scale: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`;
const px = (cells: [number, number, string][]) => cells.map(([x, y, c]) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`).join("");

/** The little craft: a glass dome, a silver saucer, three lights. */
const CRAFT = svg(
  16,
  9,
  px([
    ...[6, 7, 8, 9].map((x) => [x, 0, "#bfe3ff"] as [number, number, string]),
    ...[5, 6, 7, 8, 9, 10].map((x) => [x, 1, "#9fd0f5"] as [number, number, string]),
    ...[5, 6, 7, 8, 9, 10].map((x) => [x, 2, "#7fb8e8"] as [number, number, string]),
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((x) => [x, 3, "#d7dee8"] as [number, number, string]),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((x) => [x, 4, "#aab6c6"] as [number, number, string]),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((x) => [x, 5, "#7c8aa0"] as [number, number, string]),
    [3, 5, "#ffd77a"],
    [7, 5, "#7dffb8"],
    [11, 5, "#ff8a8a"],
    ...[4, 5, 6, 7, 8, 9, 10, 11].map((x) => [x, 6, "#5b6880"] as [number, number, string]),
  ]),
  3,
);
/** A bird in two frames of its wing beat. */
const BIRD = [
  svg(
    7,
    3,
    px([
      [0, 0, "#22324d"],
      [1, 1, "#22324d"],
      [2, 1, "#22324d"],
      [3, 2, "#22324d"],
      [4, 1, "#22324d"],
      [5, 1, "#22324d"],
      [6, 0, "#22324d"],
    ]),
    3,
  ),
  svg(
    7,
    3,
    px([
      [0, 2, "#22324d"],
      [1, 1, "#22324d"],
      [2, 1, "#22324d"],
      [3, 1, "#22324d"],
      [4, 1, "#22324d"],
      [5, 1, "#22324d"],
      [6, 2, "#22324d"],
    ]),
    3,
  ),
];
const PLANE = svg(
  11,
  4,
  px([
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((x) => [x, 2, "#ffffff"] as [number, number, string]),
    [10, 2, "#e8eef7"],
    [1, 1, "#ffffff"],
    [0, 0, "#ffffff"],
    [5, 1, "#ffffff"],
    [4, 3, "#ffffff"],
    [5, 3, "#ffffff"],
    [9, 1, "#ff5a5a"],
  ]),
  3,
);
const BALLOON = svg(
  9,
  13,
  px([
    ...[3, 4, 5].map((x) => [x, 0, "#ff6b5b"] as [number, number, string]),
    ...[1, 2, 3, 4, 5, 6, 7].map((x) => [x, 1, x % 2 ? "#ff6b5b" : "#ffd25e"] as [number, number, string]),
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8].flatMap((x) => [2, 3, 4, 5].map((y) => [x, y, x % 3 === 1 ? "#ffd25e" : "#ff6b5b"] as [number, number, string])),
    ...[1, 2, 3, 4, 5, 6, 7].map((x) => [x, 6, x % 3 === 1 ? "#ffd25e" : "#ff6b5b"] as [number, number, string]),
    ...[2, 3, 4, 5, 6].map((x) => [x, 7, "#ff6b5b"] as [number, number, string]),
    [3, 8, "#8a5a3c"],
    [5, 8, "#8a5a3c"],
    [3, 9, "#8a5a3c"],
    [5, 9, "#8a5a3c"],
    ...[3, 4, 5].flatMap((x) => [10, 11].map((y) => [x, y, "#a8703f"] as [number, number, string])),
  ]),
  3,
);

export function createVisitors(o: Opts) {
  // the first visit comes after a while; then one every 70 to 200 seconds, if the sky is free to show it
  let next = performance.now() + 25_000 + Math.random() * 30_000;
  let busy = false;
  let craftShown = false;
  const live: Animation[] = [];
  const add = (html: string, css: Partial<CSSStyleDeclaration>) => {
    const e = document.createElement("div");
    e.className = "dc-visitor";
    e.innerHTML = html;
    Object.assign(e.style, { position: "absolute", left: "0", top: "0", pointerEvents: "none", imageRendering: "pixelated", ...css });
    o.sky.appendChild(e);
    return e;
  };
  const run = (e: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions) => {
    const a = e.animate(frames, { fill: "forwards", ...opts });
    live.push(a);
    return a.finished.then(() => e.remove()).catch(() => e.remove());
  };

  function pick(): VisitorKind {
    const r = Math.random();
    if (o.isNight()) return !craftShown && r < 0.1 ? "craft" : r < 0.65 ? "shooting" : "satellite";
    return r < 0.12 ? "balloon" : r < 0.6 ? "birds" : "plane";
  }

  async function visit(kind: VisitorKind) {
    busy = true;
    const W = o.sky.clientWidth;
    const H = o.sky.clientHeight;
    const ltr = Math.random() < 0.5;
    const y = H * (0.08 + Math.random() * 0.3);
    const [from, to] = ltr ? [-60, W + 60] : [W + 60, -60];
    try {
      if (kind === "shooting") {
        const e = add('<i style="display:block;width:110px;height:2px;border-radius:2px;background:linear-gradient(90deg,rgb(255 255 255 / 0),#fff)"></i>', {});
        const x0 = W * (0.15 + Math.random() * 0.6);
        const ang = (ltr ? 1 : -1) * (18 + Math.random() * 14);
        const dx = (ltr ? 1 : -1) * 260;
        const dy = Math.abs(Math.tan((ang * Math.PI) / 180) * 260);
        await run(
          e,
          [
            { transform: `translate(${x0}px, ${y}px) rotate(${ang + (ltr ? 0 : 180)}deg) scaleX(0.2)`, opacity: 0 },
            { opacity: 1, offset: 0.25 },
            { transform: `translate(${x0 + dx}px, ${y + dy}px) rotate(${ang + (ltr ? 0 : 180)}deg) scaleX(1)`, opacity: 0 },
          ],
          { duration: 900, easing: "cubic-bezier(.3,.1,.6,1)" },
        );
      } else if (kind === "satellite") {
        const e = add('<i style="display:block;width:3px;height:3px;background:#fff;box-shadow:0 0 4px #fff"></i>', {});
        e.firstElementChild?.animate([{ opacity: 1 }, { opacity: 0.25 }], { duration: 700, iterations: Infinity, direction: "alternate" });
        await run(e, [{ transform: `translate(${from}px, ${y}px)` }, { transform: `translate(${to}px, ${y + H * 0.1}px)` }], {
          duration: 16000,
          easing: "linear",
        });
      } else if (kind === "craft") {
        craftShown = true;
        const at = o.companionAt();
        const e = add(
          `${CRAFT}<i class="dc-beam" style="position:absolute;left:50%;top:21px;width:44px;height:0;transform:translateX(-50%);background:linear-gradient(rgb(173 255 214 / .55),rgb(173 255 214 / 0));clip-path:polygon(35% 0,65% 0,100% 100%,0 100%)"></i>`,
          {},
        );
        const hx = (at?.x ?? W / 2) - 24;
        const hy = Math.max(10, (at?.y ?? H * 0.4) - 105);
        await run(
          e,
          [
            { transform: `translate(${from}px, ${hy - 40}px)` },
            { transform: `translate(${hx}px, ${hy}px)`, offset: 0.35, easing: "cubic-bezier(.2,.8,.3,1)" },
            { transform: `translate(${hx}px, ${hy + 4}px)`, offset: 0.5 },
            { transform: `translate(${hx}px, ${hy}px)`, offset: 0.65, easing: "cubic-bezier(.7,0,.8,.3)" },
            { transform: `translate(${to}px, ${hy - 90}px)` },
          ],
          { duration: 6200 },
        ).then(() => undefined);
        // the beam reaches down while it hovers, and the skyling notices
        const beam = e.querySelector<HTMLElement>(".dc-beam");
        const reach = Math.max(40, (at?.y ?? H * 0.4) - hy - 30);
        window.setTimeout(() => {
          beam?.animate([{ height: "0px" }, { height: `${reach}px`, offset: 0.4 }, { height: `${reach}px`, offset: 0.8 }, { height: "0px" }], {
            duration: 1500,
            fill: "forwards",
          });
          o.onSeen("craft", hx + 24);
        }, 6200 * 0.36);
        await new Promise((r) => window.setTimeout(r, 6300));
      } else if (kind === "birds") {
        const n = 3 + Math.floor(Math.random() * 3);
        const flock = add(
          Array.from(
            { length: n },
            (_, i) =>
              `<span class="dc-bird" style="position:absolute;left:${i * 22 + (i % 2) * 6}px;top:${Math.abs(i - (n - 1) / 2) * 9}px">${BIRD[i % 2]}</span>`,
          ).join(""),
          {},
        );
        flock.querySelectorAll<HTMLElement>(".dc-bird").forEach((b, i) => {
          b.animate([{ transform: "translateY(0)" }, { transform: "translateY(-3px)" }], {
            duration: 260 + i * 20,
            iterations: Infinity,
            direction: "alternate",
          });
        });
        o.onSeen("birds", W / 2);
        await run(
          flock,
          [{ transform: `translate(${from}px, ${y}px) scaleX(${ltr ? -1 : 1})` }, { transform: `translate(${to}px, ${y - 20}px) scaleX(${ltr ? -1 : 1})` }],
          {
            duration: 9000,
            easing: "linear",
          },
        );
      } else if (kind === "plane") {
        const e = add(
          `<i style="position:absolute;top:6px;${ltr ? "right" : "left"}:30px;width:160px;height:2px;background:linear-gradient(${ltr ? "90deg" : "270deg"},rgb(255 255 255 / 0),rgb(255 255 255 / .7))"></i><span style="display:block;transform:scaleX(${ltr ? 1 : -1})">${PLANE}</span>`,
          {},
        );
        await run(e, [{ transform: `translate(${from - 160}px, ${y * 0.6}px)` }, { transform: `translate(${to + 160}px, ${y * 0.6 - 18}px)` }], {
          duration: 14000,
          easing: "linear",
        });
      } else if (kind === "balloon") {
        const e = add(BALLOON, {});
        e.firstElementChild?.animate([{ transform: "translateY(0)" }, { transform: "translateY(-6px)" }], {
          duration: 1800,
          iterations: Infinity,
          direction: "alternate",
        });
        o.onSeen("balloon", W / 2);
        await run(e, [{ transform: `translate(${from}px, ${y + 30}px)` }, { transform: `translate(${to}px, ${y - 10}px)` }], {
          duration: 26000,
          easing: "linear",
        });
      }
    } finally {
      busy = false;
      next = performance.now() + 70_000 + Math.random() * 130_000;
    }
  }

  const tick = window.setInterval(() => {
    if (busy || document.hidden || performance.now() < next || !o.canVisit()) return;
    void visit(pick());
  }, 3000);

  return {
    /** Shows one now (for looking at it: ?debug=1). */
    visit: (kind?: VisitorKind) => !busy && void visit(kind ?? pick()),
    destroy() {
      window.clearInterval(tick);
      for (const a of live) a.cancel();
      o.sky.querySelectorAll(".dc-visitor").forEach((e) => e.remove());
    },
  };
}
