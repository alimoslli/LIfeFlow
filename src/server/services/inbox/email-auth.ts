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

/** A short list of public suffixes with two labels; relaxed alignment must never treat one of these as an owner's domain. */
const PUBLIC_SUFFIXES = new Set(
  "co.uk org.uk ac.uk gov.uk com.au net.au org.au edu.au co.nz co.jp ne.jp or.jp co.in com.br com.cn com.mx co.za com.sg com.hk github.io herokuapp.com appspot.com blogspot.com vercel.app netlify.app pages.dev workers.dev azurewebsites.net cloudfront.net amazonaws.com".split(
    " ",
  ),
);
const isSuffixOnly = (d: string) => d.split(".").length < 2 || PUBLIC_SUFFIXES.has(d);

/** DMARC relaxed alignment: the same domain, or one is a subdomain of the other, below the public suffix. */
export function aligned(a: string, b: string) {
  const x = domainOf(a);
  const y = domainOf(b);
  if (!x || !y) return false;
  if (x === y) return !isSuffixOnly(x);
  const [parent, child] = x.length < y.length ? [x, y] : [y, x];
  return child.endsWith(`.${parent}`) && !isSuffixOnly(parent);
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
  | { via: "postmark" };

export const GMAIL_AUTHSERV = "mx.google.com";
export const POSTMARK_INBOUND_HOST = "inbound.postmarkapp.com";

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

  // Postmark: the topmost Received-SPF that Postmark itself wrote (its receiver= names Postmark's inbound host).
  const spf = named("received-spf").find((v) => new RegExp(`receiver=[^\\s;]*@?${POSTMARK_INBOUND_HOST.replace(/\./g, "\\.")}(\\s|;|$)`).test(v));
  if (!spf || !/^\s*pass\b/.test(spf)) return false;
  const envelope = spf.match(/envelope-from=<?([^\s;>]+)/)?.[1];
  return !!envelope && aligned(envelope, domain);
}
