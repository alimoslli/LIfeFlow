import { ZxcvbnFactory } from "@zxcvbn-ts/core";
import * as common from "@zxcvbn-ts/language-common";
import * as en from "@zxcvbn-ts/language-en";

/**
 * Password strength, shared by the server (enforced at sign-up and password
 * change) and the browser (live meter). zxcvbn estimates how hard a password
 * is to guess from common passwords, names, words, keyboard patterns, dates
 * and repeats, which a length rule alone can't catch ("aaaaaaaaaa").
 */
const zxcvbn = new ZxcvbnFactory({
  dictionary: { ...common.dictionary, ...en.dictionary },
  graphs: common.adjacencyGraphs,
  translations: en.translations,
});

export const MIN_PASSWORD_LENGTH = 10;
/** zxcvbn score 0–4; 3 means "safely unguessable" for an online attack with rate limiting. */
export const MIN_PASSWORD_SCORE = 3;

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; ok: boolean; message: string };

const LABELS = ["Very weak", "Weak", "Fair", "Strong", "Very strong"] as const;

/** `context` = things a password shouldn't be built from (the user's name and email). */
export function checkPassword(password: string, context: string[] = []): PasswordStrength {
  const inputs = context.flatMap((c) => [c, ...c.toLowerCase().split(/[\s@._+-]+/)]).filter((x) => x.length >= 3);
  const r = zxcvbn.check(password.slice(0, 200), inputs);
  const score = r.score as PasswordStrength["score"];
  if (password.length < MIN_PASSWORD_LENGTH)
    return { score: Math.min(score, 1) as PasswordStrength["score"], ok: false, message: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  // A password that's mostly the user's own name or email is easy to guess for anyone who knows them.
  const lower = password.toLowerCase();
  const personal = inputs.map((x) => x.toLowerCase()).filter((t) => t.length >= 4 && !t.includes(" ") && lower.includes(t));
  if (personal.length) {
    const rest = personal.reduce((acc, t) => acc.split(t).join(""), lower);
    if (rest.length < MIN_PASSWORD_LENGTH || zxcvbn.check(rest).score < MIN_PASSWORD_SCORE)
      return { score: Math.min(score, 1) as PasswordStrength["score"], ok: false, message: "Weak: don't build it from your name or email." };
  }
  if (score < MIN_PASSWORD_SCORE) {
    const hint = r.feedback.warning || r.feedback.suggestions[0] || "Add a few more unrelated words.";
    return { score, ok: false, message: `${LABELS[score]}: ${hint}` };
  }
  return { score, ok: true, message: LABELS[score] };
}
