import type { JarvisTone } from "./jarvis-voice";

/**
 * What the assistant says when the user answers a promise check-in. Kept is warm; broken is honest and never
 * shaming; three broken in two weeks gets a firmer, playful line and an offer of a smaller promise.
 * Facts in, words out: counts come from the service, never guessed here.
 */
export type PromiseOutcome = "kept" | "broken" | "moved";
export type PromiseFacts = { text: string; brokenRecent: number; keptWeek: number };

/** At this many broken promises in 14 days the assistant gets an attitude. */
export const ATTITUDE_AT = 3;

const pick = <T>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length];

export function promiseReply(outcome: PromiseOutcome, tone: JarvisTone, f: PromiseFacts, seed = 0): string {
  if (outcome === "moved")
    return pick(
      {
        coach: ["Fine, tomorrow. I'll ask again then.", "Tomorrow it is. I'm holding you to it."],
        friend: ["No worries, I'll check in tomorrow.", "Tomorrow works. I'll ask then."],
        direct: ["Moved to tomorrow."],
      }[tone],
      seed,
    );

  if (outcome === "kept") {
    const streak = f.keptWeek >= 3 ? ` That's ${f.keptWeek} kept this week.` : "";
    const back = f.brokenRecent >= ATTITUDE_AT ? " And after the last few, I'll take it." : "";
    return {
      coach: [`Done. You said it and you did it.${streak}${back}`, `That's a promise kept: ${f.text}.${streak}${back}`],
      friend: [`You did it! ${f.text}, done.${streak}${back}`, `Look at you, doing what you said.${streak}${back}`],
      direct: [`Kept: ${f.text}.${streak}`],
    }[tone][seed % (tone === "direct" ? 1 : 2)];
  }

  // broken
  if (f.brokenRecent >= ATTITUDE_AT)
    return {
      coach: [`That's ${f.brokenRecent} this fortnight. I'm not mad, I just know you're better than this. Make the next one smaller and mean it?`],
      friend: [`Okay, that's ${f.brokenRecent} in two weeks and I'm giving you a look. Pick something smaller and we'll get one back on the board?`],
      direct: [`${f.brokenRecent} broken in 14 days. Make the next promise smaller.`],
    }[tone][0];
  return {
    coach: ["Okay. It happens. What's a smaller version you can actually do?", "Noted. Tell me when you'll try again."],
    friend: ["That's okay, some days win. Want to try a smaller one?", "No stress. Tell me when you want another shot."],
    direct: ["Noted. Say when you want to retry."],
  }[tone][seed % (tone === "direct" ? 1 : 2)];
}

/** The check-in question, in the assistant's voice. The headline is the promise, in the user's own words. */
export const promiseAsk = (tone: JarvisTone) => (tone === "direct" ? "Did you do it?" : tone === "coach" ? "Did you follow through?" : "How did it go?");

/** The three answers on a check-in card. The first keeps the promise, the second moves it a day, the third breaks it. */
export const PROMISE_CHOICES = { kept: "Yes, I did it", moved: "Tomorrow instead", broken: "It didn't happen" } as const;
