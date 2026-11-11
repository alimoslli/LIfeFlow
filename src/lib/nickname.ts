/**
 * Optional public nickname on the waitlist (owner, 2026-11-11, backlog step 6). Others see it on the front of the line,
 * so it is checked on the server here, never only in the browser.
 *
 * Rules: trimmed, inner runs of spaces collapsed to one; 2 to 16 characters; letters, numbers, spaces and - _ ' .
 * only; nothing that looks like an email (an @), a web address (://, www., or a dot followed by a domain-like
 * word) and no run of 7 or more digits (phone-like, spaces and dashes between digits do not hide it).
 */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 16;

export type NicknameCheck = { ok: true; nickname: string } | { ok: false; error: string };

export function checkNickname(raw: string): NicknameCheck {
  const nickname = raw.trim().replace(/\s+/g, " ");
  if (nickname.length < NICKNAME_MIN || nickname.length > NICKNAME_MAX) return { ok: false, error: `Use ${NICKNAME_MIN} to ${NICKNAME_MAX} characters.` };
  if (!/^[\p{L}\p{N} _'.-]+$/u.test(nickname)) return { ok: false, error: "Use letters, numbers, spaces and - _ ' . only." };
  const lower = nickname.toLowerCase();
  if (nickname.includes("@") || lower.includes("://") || lower.includes("www.") || /\.[a-z]{2,}/.test(lower))
    return { ok: false, error: "A nickname can't be an email or a web address." };
  if (/\d(?:[\s._'-]*\d){6}/.test(nickname)) return { ok: false, error: "A nickname can't hold a phone number." };
  return { ok: true, nickname };
}
