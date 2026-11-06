import { getDomain } from "tldts";

type Header = { Name: string; Value: string };

/**
 * Header text with comments "(…)" removed and quoted strings flattened, so text an attacker can
 * echo into a header (an envelope sender such as "a;dkim=pass header.i=@x.edu"@evil.io) can't
 * pose as a separate result. Inside a flattened quote, ';', '=', '(', ')', '"' and whitespace become '_'.
 */
export function flattenHeader(v: string) {
  let out = "";
  let depth = 0;
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === "\\" && i + 1 < v.length) {
      i++; // escaped character: never structural
      if (depth === 0) out += "_";
    } else if (c === '"') {
      // A quoted string (inside a comment it is just part of the comment).
      let j = i + 1;
      let s = "";
      while (j < v.length && v[j] !== '"') {
        if (v[j] === "\\") j++;
        s += v[j] ?? "";
        j++;
      }
      if (depth === 0) out += s.replace(/[;=()"\s\\]/g, "_");
      i = j;
    } else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) out += c;
  }
  return out;
}

/** The one address in a From header, or "" when there isn't exactly one. Uses the LAST angle address, after display names and comments are removed. */
export function parseFromAddress(from: string) {
  // Remove quoted display names and comments, but keep what is inside <…>.
  let out = "";
  let depth = 0;
  let angle = false;
  for (let i = 0; i < from.length; i++) {
    const c = from[i];
    if (depth === 0 && !angle && c === '"') {
      let j = i + 1;
      while (j < from.length && from[j] !== '"') j += from[j] === "\\" ? 2 : 1;
      i = j;
    } else if (!angle && c === "(") depth++;
    else if (!angle && c === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (c === "<") angle = true;
      if (c === ">") angle = false;
      out += c;
    }
  }
  if (out.includes(",") || out.includes(";")) return "";
  const angles = [...out.matchAll(/<([^<>]*)>/g)];
  const addr = (angles.length ? angles[angles.length - 1][1] : out).trim().toLowerCase();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(addr) ? addr : "";
}

const domainOf = (v: string) => (v.trim().replace(/^<|>$/g, "").toLowerCase().split("@").pop() ?? "").replace(/^@/, "").replace(/\.$/, "");

/** The registrable ("organisational") domain, or null for a public suffix such as co.uk, ac.jp or k12.ca.us. */
const orgDomain = (d: string) => getDomain(d, { allowPrivateDomains: true });

/** DMARC relaxed alignment: both names share the same registrable domain, never just a public suffix. */
export function aligned(a: string, b: string) {
  const x = orgDomain(domainOf(a));
  const y = orgDomain(domainOf(b));
  return !!x && x === y;
}

/** "ptype.property=value" tokens of one result clause. */
function props(clause: string) {
  const out: Record<string, string> = {};
  for (const t of clause.trim().split(/\s+/).slice(1)) {
    const eq = t.indexOf("=");
    if (eq > 0) out[t.slice(0, eq)] = t.slice(eq + 1);
  }
  return out;
}

export type AuthSource =
  /** Gmail API messages: only the topmost Authentication-Results, written by mx.google.com itself. */
  | { via: "gmail" }
  /** Postmark inbound webhook: Authentication-Results is ignored; only Postmark's own topmost Received-SPF counts. */
  | { via: "postmark"; recipient: string };

export const GMAIL_AUTHSERV = "mx.google.com";

/**
 * Was this email really sent by `from` (a bare address)? Only the receiving server's own result
 * counts, and the passing domain must be aligned with the From domain (exact, or relaxed alignment
 * below the public suffix). Look-alikes and prefixes never match.
 */
export function senderAuthenticated(headers: Header[], from: string, source: AuthSource) {
  const domain = from.includes("@") ? domainOf(from) : "";
  if (!domain) return false;
  const named = (n: string) => headers.filter((h) => h.Name.toLowerCase() === n).map((h) => flattenHeader(h.Value).toLowerCase());

  if (source.via === "gmail") {
    const top = named("authentication-results")[0];
    if (!top) return false;
    const [id, ...clauses] = top.split(";").map((p) => p.trim());
    if (id.split(/\s+/)[0] !== GMAIL_AUTHSERV) return false;
    for (const clause of clauses) {
      const p = props(clause);
      const method = clause.trim().split(/\s+/)[0];
      if (method === "dmarc=pass" && p["header.from"] && domainOf(p["header.from"]) === domain) return true;
      if (method === "dkim=pass" && [p["header.d"], p["header.i"]].some((v) => v && aligned(v, domain))) return true;
      if (method === "spf=pass" && p["smtp.mailfrom"] && aligned(p["smtp.mailfrom"], domain)) return true;
    }
    return false;
  }

  // TODO(auto-file): the forwarding route does NOT auto-file on the strength of this check. We have not
  // confirmed that Postmark's Received-SPF is always the topmost one, so a forged Pass placed first could be
  // trusted, and rejecting mail with several Received-SPF lines would block normal forwards (a Gmail forward
  // carries Gmail's own). Forwarded mail therefore only becomes a suggestion the person files with one tap.
  // Auto-filing can return once a real captured Postmark inbound payload (saved in tests/fixtures/) confirms
  // the header order.
  // Postmark: the TOPMOST Received-SPF is the one Postmark itself wrote (every hop before it is lower).
  // It must name the address the mail was delivered to (the webhook's OriginalRecipient) as its receiver.
  const spf = named("received-spf")[0];
  if (!spf || !/^\s*pass\b/.test(spf)) return false;
  const receiver = spf.match(/receiver=<?([^\s;>]+)/)?.[1];
  if (!receiver || !source.recipient || receiver !== source.recipient.trim().toLowerCase()) return false;
  const envelope = spf.match(/envelope-from=<?([^\s;>]+)/)?.[1];
  return !!envelope && aligned(envelope, domain);
}
