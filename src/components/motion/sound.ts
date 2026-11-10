/**
 * Little sounds made in code (no files): the milestone's pop and rising chime (owner, 2026-11-10: "with a pop-up sound").
 * They follow a tap, so the browser lets them play; a phone on silent stays silent. Off with localStorage "lf-sound" = "off".
 */
let ctx: AudioContext | null = null;
function audio() {
  try {
    if (typeof localStorage !== "undefined" && localStorage.getItem("lf-sound") === "off") return null;
  } catch {
    /* storage blocked: sounds stay on */
  }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = ctx || new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
function note(ac: AudioContext, freq: number, at: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const t0 = ac.currentTime + at;
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ac.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}
/**
 * Wakes the sound up during a tap, so a sound that follows a moment later (after the save comes back) may play:
 * phones only let sound start from a tap.
 */
export function primeSound() {
  audio();
}

/** The milestone: a pop as the sun jumps out, three rising notes and a sparkle, then a little "bloop" for the tongue. */
export function milestoneSound() {
  const ac = audio();
  if (!ac) return;
  note(ac, 280, 0.1, 0.11, "sine", 0.1, 920);
  [659.25, 783.99, 1046.5].forEach((f, i) => note(ac, f, 0.24 + i * 0.085, 0.17, "triangle", 0.06));
  note(ac, 1318.51, 0.5, 0.3, "triangle", 0.045);
  note(ac, 430, 0.86, 0.13, "sine", 0.07, 250);
}
