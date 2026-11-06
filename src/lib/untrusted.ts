import { parseFromAddress } from "../server/services/inbox/email-auth";

/**
 * Third-party text (email, documents) goes to the model inside a marker pair such as
 * <untrusted_email_9f3a…>…</untrusted_email_9f3a…>. Two defences, both applied:
 *  - the tag name carries a random per-call suffix, so the text can't know the closing marker;
 *  - the text is normalised (NFKC, so fullwidth "＜" becomes "<"; invisible format characters such as
 *    U+200B, U+2060, U+00AD removed) and any "<" that starts a closing tag or an "untrusted" tag becomes "&lt;".
 */
export const neutralize = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Co}]/gu, "")
    .replace(/<(?=\s*\/|\s*!|\s*untrusted)/gi, "&lt;");

export const wrapUntrusted = (tag: string, s: string, nonce = crypto.randomUUID().replace(/-/g, "").slice(0, 12)) => {
  const t = `${tag}_${nonce}`;
  return `<${t}>\n${neutralize(s)}\n</${t}>`;
};

/**
 * A sender for a one-line summary: the display name, capped, markers neutralised. When the name is empty or
 * contains "@" (a name that poses as an address), the real address is shown instead.
 */
export function senderLabel(from: string, max = 40) {
  // Normalise first, so fullwidth "＠" and small "﹫" are seen as "@".
  const name = neutralize(from.replace(/<[^>]*>/g, ""))
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const shown = name && !name.includes("@") ? name : parseFromAddress(from.normalize("NFKC")) || "unknown sender";
  const clean = neutralize(shown).replace(/[<>]/g, "");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** A subject for a one-line summary, capped and neutralised. */
export function subjectLabel(subject: string, max = 80) {
  const clean = neutralize(subject).replace(/\s+/g, " ").replace(/[<>]/g, "").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}
