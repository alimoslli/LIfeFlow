type Header = { Name: string; Value: string };

/** Lower-case domain of a bare address, or of a bare domain. */
const domainOf = (v: string) => {
  const d = v.trim().replace(/^<|>$/g, "").toLowerCase().split("@").pop() ?? "";
  return d.replace(/^@/, "");
};

/** Same domain, or a real subdomain of it ("mail.school.edu" for "school.edu"), never a prefix or look-alike. */
const sameDomain = (candidate: string, domain: string) => {
  const c = domainOf(candidate);
  return !!c && !!domain && (c === domain || c.endsWith(`.${domain}`));
};

/**
 * Was this email really sent by the address in `from`? We only accept what the
 * RECEIVING server wrote: the topmost Authentication-Results header (anything lower
 * was added by earlier hops, including the sender), and for Gmail only when its
 * authserv-id is `mx.google.com`. Domains must match exactly or as a real subdomain.
 * `from` must be the bare address.
 */
export function senderAuthenticated(headers: Header[], from: string, opts: { authserv?: string } = {}) {
  const domain = from.includes("@") ? domainOf(from) : "";
  if (!domain) return false;
  const named = (n: string) => headers.filter((h) => h.Name.toLowerCase() === n).map((h) => h.Value.toLowerCase());
  const top = named("authentication-results")[0];
  if (top) {
    const [id, ...results] = top.split(";").map((p) => p.trim());
    const authserv = id.split(/\s+/)[0];
    if (!opts.authserv || authserv === opts.authserv.toLowerCase()) {
      for (const r of results) {
        const prop = (k: string) => r.match(new RegExp(`${k}=([^\\s;]+)`))?.[1];
        if (/^dkim=pass\b/.test(r) && [prop("header\\.d"), prop("header\\.i")].some((v) => v && sameDomain(v, domain))) return true;
        if (/^spf=pass\b/.test(r)) {
          const mf = prop("smtp\\.mailfrom");
          if (mf && sameDomain(mf, domain)) return true;
        }
      }
    }
  }
  // Received-SPF is only trusted for providers that don't say which server wrote the header (not Gmail).
  if (!opts.authserv) {
    const spf = named("received-spf")[0];
    if (spf?.startsWith("pass")) {
      const id = spf.match(/envelope-from=<?([^\s;>]+)/)?.[1] ?? spf.match(/domain of <?([^\s;>]+)/)?.[1];
      if (id && sameDomain(id, domain)) return true;
    }
  }
  return false;
}
