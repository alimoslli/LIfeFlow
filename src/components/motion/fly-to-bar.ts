import { prefersReducedMotion } from "./gsap";

/**
 * A cloud that holds a question floats down into the chat box and merges into it (owner, 2026-11-12: "when i touch a cloud
 * and its a prompt make it smoothly go down attach and merge into the chatbox"): a copy of the cloud drifts down, shrinking
 * to the box's size and fading as it reaches it, the box swells a little as the words land, and only then are they put in
 * (`done`). The box is whichever `[data-cloud-target]` is on screen (Today's bar, the skyling's message box). Reduced motion,
 * or no box in view: the words go straight in.
 */
export function flyToBar(from: HTMLElement | null | undefined, done: () => void) {
  const to = [...document.querySelectorAll<HTMLElement>("[data-cloud-target]")].find((el) => el.getClientRects().length > 0);
  if (!from || !to || prefersReducedMotion() || typeof from.animate !== "function") return done();
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  const ghost = from.cloneNode(true) as HTMLElement;
  ghost.setAttribute("aria-hidden", "true");
  ghost.querySelectorAll("button").forEach((el) => el.setAttribute("tabindex", "-1"));
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    margin: "0",
    zIndex: "60",
    pointerEvents: "none",
    transformOrigin: "50% 50%",
    animation: "none",
  });
  document.body.appendChild(ghost);
  from.style.visibility = "hidden";
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const sx = Math.min(1, b.width / a.width);
  const sy = Math.min(1, b.height / a.height);
  const flight = ghost.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.35}px, ${dy * 0.25 - 8}px) scale(${0.85 + sx * 0.1}, ${0.75 + sy * 0.15})`, opacity: 1, offset: 0.35 },
      { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, opacity: 0 },
    ],
    { duration: 760, easing: "cubic-bezier(0.45, 0, 0.25, 1)" },
  );
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    ghost.remove();
    from.style.visibility = "";
    to.animate([{ transform: "scale(1)" }, { transform: "scale(1.03)" }, { transform: "scale(1)" }], { duration: 280, easing: "ease-out" });
    done();
  };
  flight.onfinish = finish;
  flight.oncancel = finish;
}
